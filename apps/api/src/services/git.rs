use super::*;

pub(crate) async fn create_bare_repo(path: &PathBuf) -> ApiResult<()> {
    if fs::try_exists(path).await? {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let output = Command::new("git")
        .arg("init")
        .arg("--bare")
        .arg(path)
        .output()
        .await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

pub(crate) enum RepoFileChange {
    Delete,
    Write(String),
}

pub(crate) async fn repo_file_response(
    repo: &Repository,
    path: &str,
    ref_name: Option<&str>,
) -> ApiResult<RepositoryFileResponse> {
    let commit_sha = resolve_git_ref(repo, ref_name)
        .await?
        .ok_or(ApiError::NotFound)?;
    let object = format!("{}:{}", commit_sha, path);
    let kind = run_git_command(
        repo,
        &["cat-file".to_string(), "-t".to_string(), object.clone()],
    )
    .await?;
    if kind.trim() != "blob" {
        return Err(ApiError::NotFound);
    }
    let size = run_git_command(
        repo,
        &["cat-file".to_string(), "-s".to_string(), object.clone()],
    )
    .await?
    .trim()
    .parse::<i64>()
    .unwrap_or(0);
    let name = repo_path_name(path);
    let extension = file_extension(&name);
    let media_type = media_type_for_path(&name);
    let is_binary = is_binary_extension(extension.as_deref());
    let content = if is_binary {
        String::new()
    } else {
        run_git_command(repo, &["show".to_string(), object]).await?
    };

    Ok(RepositoryFileResponse {
        extension,
        name,
        path: path.to_string(),
        size,
        content,
        is_binary,
        media_type,
        last_commit: git_last_commit(repo, &commit_sha, Some(path)).await?,
    })
}

pub(crate) async fn commit_repo_file_change(
    repo: &Repository,
    auth: &AuthUser,
    path: &str,
    change: RepoFileChange,
    message: String,
) -> ApiResult<()> {
    let worktree = env::temp_dir().join(format!("diggit-worktree-{}", Uuid::now_v7()));
    fs::create_dir_all(&worktree).await?;

    let result =
        commit_repo_file_change_in_worktree(repo, auth, path, change, message, &worktree).await;
    let _ = fs::remove_dir_all(&worktree).await;
    result
}

pub(crate) async fn commit_repo_file_change_in_worktree(
    repo: &Repository,
    auth: &AuthUser,
    path: &str,
    change: RepoFileChange,
    message: String,
    worktree: &PathBuf,
) -> ApiResult<()> {
    run_git_worktree_command(
        repo,
        worktree,
        &[
            "checkout".to_string(),
            "-f".to_string(),
            repo.default_branch.clone(),
        ],
    )
    .await?;

    match change {
        RepoFileChange::Write(content) => {
            let file_path = worktree.join(path);
            if let Some(parent) = file_path.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::write(file_path, content).await?;
            run_git_worktree_command(
                repo,
                worktree,
                &["add".to_string(), "--".to_string(), path.to_string()],
            )
            .await?;
        }
        RepoFileChange::Delete => {
            run_git_worktree_command(
                repo,
                worktree,
                &[
                    "rm".to_string(),
                    "-r".to_string(),
                    "--".to_string(),
                    path.to_string(),
                ],
            )
            .await?;
        }
    }

    let diff = git_worktree_command(
        repo,
        worktree,
        &[
            "diff".to_string(),
            "--cached".to_string(),
            "--quiet".to_string(),
        ],
    )
    .await?;
    if diff.status.success() {
        return Err(ApiError::BadRequest("no changes to commit".to_string()));
    }

    let author_name = auth.username.clone();
    let author_email = format!("{}@diggit.local", auth.username);
    let mut command = Command::new("git");
    command
        .arg("--git-dir")
        .arg(&repo.local_path)
        .arg("--work-tree")
        .arg(worktree)
        .arg("commit")
        .arg("-m")
        .arg(message)
        .env("GIT_AUTHOR_NAME", &author_name)
        .env("GIT_AUTHOR_EMAIL", &author_email)
        .env("GIT_COMMITTER_NAME", &author_name)
        .env("GIT_COMMITTER_EMAIL", &author_email);
    let output = command.output().await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(())
}

pub(crate) async fn resolve_git_ref(
    repo: &Repository,
    requested: Option<&str>,
) -> ApiResult<Option<String>> {
    let candidates = if let Some(ref_name) = requested {
        vec![ref_name.to_string()]
    } else {
        vec![repo.default_branch.clone(), "HEAD".to_string()]
    };

    for ref_name in candidates {
        if ref_name.trim().is_empty() || ref_name.contains('\0') {
            continue;
        }
        let spec = format!("{}^{{commit}}", ref_name);
        let output = try_run_git_command(
            repo,
            &["rev-parse".to_string(), "--verify".to_string(), spec],
        )
        .await?;
        if let Some(sha) = output
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            return Ok(Some(sha));
        }
    }

    Ok(None)
}

pub(crate) async fn git_last_commit(
    repo: &Repository,
    commit_sha: &str,
    path: Option<&str>,
) -> ApiResult<Option<RepositoryCommitResponse>> {
    let mut args = vec![
        "log".to_string(),
        "-1".to_string(),
        "--format=%H%x1f%s%x1f%cI%x1f%an%x1f%ae".to_string(),
        commit_sha.to_string(),
    ];

    if let Some(path) = path {
        args.push("--".to_string());
        args.push(path.to_string());
    }

    let output = try_run_git_command(repo, &args).await?;
    Ok(output.and_then(|value| parse_git_commit(&value)))
}

pub(crate) async fn run_git_command(repo: &Repository, args: &[String]) -> ApiResult<String> {
    let output = git_command(repo, args).await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) async fn run_git_command_bytes(
    repo: &Repository,
    args: &[String],
) -> ApiResult<Vec<u8>> {
    let output = git_command(repo, args).await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(output.stdout)
}

pub(crate) async fn try_run_git_command(
    repo: &Repository,
    args: &[String],
) -> ApiResult<Option<String>> {
    let output = git_command(repo, args).await?;
    if !output.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).to_string()))
}

pub(crate) async fn git_command(
    repo: &Repository,
    args: &[String],
) -> ApiResult<std::process::Output> {
    let mut command = Command::new("git");
    command.arg("--git-dir").arg(&repo.local_path);
    for arg in args {
        command.arg(arg);
    }
    Ok(command.output().await?)
}

pub(crate) async fn run_git_worktree_command(
    repo: &Repository,
    worktree: &PathBuf,
    args: &[String],
) -> ApiResult<String> {
    let output = git_worktree_command(repo, worktree, args).await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) async fn git_worktree_command(
    repo: &Repository,
    worktree: &PathBuf,
    args: &[String],
) -> ApiResult<std::process::Output> {
    let mut command = Command::new("git");
    command
        .arg("--git-dir")
        .arg(&repo.local_path)
        .arg("--work-tree")
        .arg(worktree);
    for arg in args {
        command.arg(arg);
    }
    Ok(command.output().await?)
}

pub(crate) fn parse_git_commit(output: &str) -> Option<RepositoryCommitResponse> {
    let mut parts = output.trim_end().split('\x1f');
    let sha = parts.next()?.trim();
    if sha.is_empty() {
        return None;
    }
    let message = parts.next().unwrap_or_default().to_string();
    let created_at = parts.next().unwrap_or_default().to_string();
    let author_name = parts.next().unwrap_or("Unknown author").to_string();
    let author_email = parts.next().unwrap_or_default().to_string();

    Some(RepositoryCommitResponse {
        sha: sha.to_string(),
        message,
        avatar_fallback: avatar_fallback(&author_name),
        author_name,
        author_email,
        created_at,
    })
}

pub(crate) fn parse_ls_tree_line(line: &str) -> Option<(String, String, Option<i64>)> {
    let (metadata, path) = line.split_once('\t')?;
    let parts: Vec<&str> = metadata.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }

    let kind = if parts[1] == "tree" {
        "directory"
    } else {
        "file"
    }
    .to_string();
    let size = parts[3].parse::<i64>().ok();
    Some((path.to_string(), kind, size))
}

pub(crate) fn normalize_repo_file_path(path: &str) -> ApiResult<String> {
    let normalized = path.trim().trim_start_matches('/').to_string();
    let invalid = normalized.is_empty()
        || normalized.contains('\0')
        || normalized
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..");

    if invalid {
        return Err(ApiError::BadRequest("invalid repository path".to_string()));
    }

    Ok(normalized)
}

pub(crate) fn repo_path_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

pub(crate) fn file_extension(name: &str) -> Option<String> {
    name.rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .filter(|extension| !extension.is_empty())
}

pub(crate) fn is_binary_extension(extension: Option<&str>) -> bool {
    matches!(
        extension,
        Some("avif" | "gif" | "jpeg" | "jpg" | "mov" | "mp4" | "pdf" | "png" | "webm" | "webp")
    )
}

pub(crate) fn media_type_for_path(path: &str) -> String {
    match file_extension(path).as_deref() {
        Some("avif") => "image/avif",
        Some("gif") => "image/gif",
        Some("jpeg") | Some("jpg") => "image/jpeg",
        Some("md") | Some("mdx") => "text/markdown; charset=utf-8",
        Some("mov") => "video/quicktime",
        Some("mp4") => "video/mp4",
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("webm") => "video/webm",
        Some("webp") => "image/webp",
        Some("json") => "application/json; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "text/plain; charset=utf-8",
    }
    .to_string()
}
