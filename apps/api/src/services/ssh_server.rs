use super::*;
use anyhow::{Context, anyhow};
use russh::{
    Channel, ChannelId,
    keys::{Algorithm, PrivateKey, PublicKey, ssh_key::LineEnding},
    server::{self, Auth, Handler, Server, Session},
};
use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{io, net::TcpListener, task::JoinHandle};

#[derive(Clone)]
pub(crate) struct GitSshServer {
    state: AppState,
}

pub(crate) async fn spawn_ssh_server(
    state: AppState,
) -> anyhow::Result<JoinHandle<anyhow::Result<()>>> {
    let bind_addr = format!("{}:{}", state.config.ssh_bind_host, state.config.ssh_port);
    let listener = TcpListener::bind(&bind_addr)
        .await
        .with_context(|| format!("failed to bind SSH listener on {bind_addr}"))?;
    let host_key = load_or_create_host_key(&state.config.ssh_host_key_path)?;
    let config = Arc::new(server::Config {
        inactivity_timeout: Some(Duration::from_secs(3600)),
        auth_rejection_time: Duration::from_secs(3),
        auth_rejection_time_initial: Some(Duration::from_millis(250)),
        keys: vec![host_key],
        ..Default::default()
    });
    let mut server = GitSshServer { state };

    Ok(tokio::spawn(async move {
        server
            .run_on_socket(config, &listener)
            .await
            .context("SSH server failed")
    }))
}

fn load_or_create_host_key(path: &PathBuf) -> anyhow::Result<PrivateKey> {
    if path.exists() {
        return PrivateKey::read_openssh_file(path)
            .with_context(|| format!("failed to read SSH host key {}", path.display()));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "failed to create SSH host key directory {}",
                parent.display()
            )
        })?;
    }

    let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519)
        .context("failed to generate SSH host key")?;
    key.write_openssh_file(path, LineEnding::LF)
        .with_context(|| format!("failed to write SSH host key {}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).with_context(
            || {
                format!(
                    "failed to restrict SSH host key permissions {}",
                    path.display()
                )
            },
        )?;
    }

    Ok(key)
}

impl server::Server for GitSshServer {
    type Handler = GitSshSession;

    fn new_client(&mut self, _peer_addr: Option<SocketAddr>) -> Self::Handler {
        GitSshSession {
            state: self.state.clone(),
            auth: None,
            channels: HashMap::new(),
        }
    }

    fn handle_session_error(&mut self, error: <Self::Handler as Handler>::Error) {
        warn!(%error, "SSH session failed");
    }
}

pub(crate) struct GitSshSession {
    state: AppState,
    auth: Option<AuthUser>,
    channels: HashMap<ChannelId, Channel<server::Msg>>,
}

impl Handler for GitSshSession {
    type Error = anyhow::Error;

    async fn auth_none(&mut self, _user: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Reject {
            proceed_with_methods: None,
            partial_success: false,
        })
    }

    async fn auth_password(&mut self, _user: &str, _password: &str) -> Result<Auth, Self::Error> {
        Ok(Auth::Reject {
            proceed_with_methods: None,
            partial_success: false,
        })
    }

    async fn auth_publickey_offered(
        &mut self,
        user: &str,
        public_key: &PublicKey,
    ) -> Result<Auth, Self::Error> {
        if user != "git" {
            return Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            });
        }

        if lookup_auth_user(&self.state, public_key).await?.is_some() {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            })
        }
    }

    async fn auth_publickey(
        &mut self,
        user: &str,
        public_key: &PublicKey,
    ) -> Result<Auth, Self::Error> {
        if user != "git" {
            return Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            });
        }

        let Some(auth) = lookup_auth_user(&self.state, public_key).await? else {
            return Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            });
        };
        let fingerprint = public_key_fingerprint(public_key)?;
        sqlx::query("UPDATE ssh_keys SET last_used_at = now() WHERE fingerprint = $1")
            .bind(fingerprint)
            .execute(&self.state.pool)
            .await?;
        self.auth = Some(auth);
        Ok(Auth::Accept)
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<server::Msg>,
        _session: &mut Session,
    ) -> Result<bool, Self::Error> {
        self.channels.insert(channel.id(), channel);
        Ok(true)
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_failure(channel)?;
        session.close(channel)?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel_id: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let Some(auth) = self.auth.clone() else {
            session.channel_failure(channel_id)?;
            session.close(channel_id)?;
            return Ok(());
        };
        let Some(channel) = self.channels.remove(&channel_id) else {
            session.channel_failure(channel_id)?;
            session.close(channel_id)?;
            return Ok(());
        };
        let command = String::from_utf8_lossy(data).to_string();
        let state = self.state.clone();
        let handle = session.handle();

        match prepare_git_ssh_command(&state, &auth, &command).await {
            Ok(prepared) => {
                session.channel_success(channel_id)?;
                tokio::spawn(async move {
                    if let Err(error) =
                        run_git_ssh_command(channel, handle, channel_id, prepared).await
                    {
                        warn!(%error, "SSH Git command failed");
                    }
                });
            }
            Err(error) => {
                let _ = session.extended_data(channel_id, 1, format!("{error}\n").into_bytes());
                session.channel_failure(channel_id)?;
                session.close(channel_id)?;
            }
        }

        Ok(())
    }
}

async fn lookup_auth_user(
    state: &AppState,
    public_key: &PublicKey,
) -> anyhow::Result<Option<AuthUser>> {
    let fingerprint = public_key_fingerprint(public_key)?;
    let user: Option<(Uuid, String)> = sqlx::query_as(
        r#"
        SELECT users.id, users.username
        FROM ssh_keys
        JOIN users ON users.id = ssh_keys.user_id
        WHERE ssh_keys.fingerprint = $1
        "#,
    )
    .bind(fingerprint)
    .fetch_optional(&state.pool)
    .await?;

    Ok(user.map(|(id, username)| AuthUser { id, username }))
}

fn public_key_fingerprint(public_key: &PublicKey) -> anyhow::Result<String> {
    let openssh = public_key
        .to_openssh()
        .context("failed to encode SSH public key")?;
    ssh_key_fingerprint(&openssh).map_err(|error| anyhow!(error.to_string()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedGitSshCommand {
    service: GitSshService,
    owner: String,
    name: String,
}

struct PreparedGitSshCommand {
    repo: Repository,
    service: GitSshService,
}

async fn prepare_git_ssh_command(
    state: &AppState,
    auth: &AuthUser,
    command: &str,
) -> anyhow::Result<PreparedGitSshCommand> {
    let parsed = parse_git_ssh_command(command)?;
    let repo = find_repo(&state.pool, &parsed.owner, &parsed.name).await?;

    match parsed.service {
        GitSshService::UploadPack => {
            ensure_repo_visible(&state.pool, Some(auth), &repo).await?;
        }
        GitSshService::ReceivePack => {
            resolve_writable_namespace(&state.pool, auth, &repo.owner_handle).await?;
        }
    }

    Ok(PreparedGitSshCommand {
        repo,
        service: parsed.service,
    })
}

async fn run_git_ssh_command(
    channel: Channel<server::Msg>,
    handle: server::Handle,
    channel_id: ChannelId,
    prepared: PreparedGitSshCommand,
) -> anyhow::Result<()> {
    let mut child = git_ssh_service_command(&prepared.repo, prepared.service)
        .spawn()
        .context("failed to start Git service")?;
    let mut child_stdin = child.stdin.take().context("missing Git stdin")?;
    let mut child_stdout = child.stdout.take().context("missing Git stdout")?;
    let mut child_stderr = child.stderr.take().context("missing Git stderr")?;

    let stream = channel.into_stream();
    let (mut ssh_reader, mut ssh_writer) = io::split(stream);
    let stderr_handle = handle.clone();

    let stdin_task = tokio::spawn(async move {
        let result = io::copy(&mut ssh_reader, &mut child_stdin).await;
        let _ = child_stdin.shutdown().await;
        result
    });
    let stdout_task = tokio::spawn(async move {
        let result = io::copy(&mut child_stdout, &mut ssh_writer).await;
        let _ = ssh_writer.shutdown().await;
        result
    });
    let stderr_task = tokio::spawn(async move {
        let mut buffer = [0_u8; 8192];
        loop {
            let read = child_stderr.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            stderr_handle
                .extended_data(channel_id, 1, buffer[..read].to_vec())
                .await
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "SSH stderr closed"))?;
        }
        Ok::<(), io::Error>(())
    });

    let status = child
        .wait()
        .await
        .context("failed waiting for Git service")?;
    let _ = stdin_task.await;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    let code = status.code().unwrap_or(1).max(0) as u32;
    let _ = handle.exit_status_request(channel_id, code).await;
    let _ = handle.eof(channel_id).await;
    let _ = handle.close(channel_id).await;
    Ok(())
}

pub(crate) fn parse_git_ssh_command(command: &str) -> anyhow::Result<ParsedGitSshCommand> {
    let words = shell_words(command)?;
    if words.len() != 2 {
        return Err(anyhow!("unsupported SSH command"));
    }

    let service = match words[0].as_str() {
        "git-upload-pack" => GitSshService::UploadPack,
        "git-receive-pack" => GitSshService::ReceivePack,
        _ => return Err(anyhow!("unsupported SSH command")),
    };
    let (owner, name) = parse_repo_path(&words[1])?;

    Ok(ParsedGitSshCommand {
        service,
        owner,
        name,
    })
}

fn parse_repo_path(value: &str) -> anyhow::Result<(String, String)> {
    let path = value
        .trim()
        .trim_start_matches('/')
        .trim_end_matches(".git");
    let mut parts = path.split('/');
    let owner = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| anyhow!("repository owner is required"))?;
    let name = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| anyhow!("repository name is required"))?;
    if parts.next().is_some() {
        return Err(anyhow!("repository path must be owner/repo.git"));
    }

    Ok((normalize_name(owner)?, normalize_name(name)?))
}

fn shell_words(command: &str) -> anyhow::Result<Vec<String>> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut chars = command.trim().chars().peekable();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    while let Some(ch) = chars.next() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' && quote != Some('\'') {
            escaped = true;
            continue;
        }
        if quote == Some(ch) {
            quote = None;
            continue;
        }
        if quote.is_none() && (ch == '\'' || ch == '"') {
            quote = Some(ch);
            continue;
        }
        if quote.is_none() && ch.is_whitespace() {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            while chars.peek().is_some_and(|next| next.is_whitespace()) {
                chars.next();
            }
            continue;
        }
        current.push(ch);
    }

    if escaped || quote.is_some() {
        return Err(anyhow!("unterminated SSH command"));
    }
    if !current.is_empty() {
        words.push(current);
    }
    Ok(words)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_git_upload_pack_command() {
        let parsed = parse_git_ssh_command("git-upload-pack '/haouarihk/test.git'").unwrap();
        assert_eq!(parsed.service, GitSshService::UploadPack);
        assert_eq!(parsed.owner, "haouarihk");
        assert_eq!(parsed.name, "test");
    }

    #[test]
    fn parses_git_receive_pack_command() {
        let parsed = parse_git_ssh_command("git-receive-pack haouarihk/test.git").unwrap();
        assert_eq!(parsed.service, GitSshService::ReceivePack);
        assert_eq!(parsed.owner, "haouarihk");
        assert_eq!(parsed.name, "test");
    }

    #[test]
    fn rejects_shell_and_nested_paths() {
        assert!(parse_git_ssh_command("bash").is_err());
        assert!(parse_git_ssh_command("git-upload-pack haouarihk/nested/test.git").is_err());
    }

    #[test]
    fn fingerprints_russh_public_keys_like_stored_keys() {
        let private_key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap();
        let public_key = private_key.public_key();
        let openssh = public_key.to_openssh().unwrap();

        assert_eq!(
            public_key_fingerprint(public_key).unwrap(),
            ssh_key_fingerprint(&openssh).unwrap()
        );
    }
}
