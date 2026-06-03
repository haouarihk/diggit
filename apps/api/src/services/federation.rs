use super::*;

pub(crate) async fn ensure_server_allowed(pool: &PgPool, host: &str) -> ApiResult<()> {
    ensure_safe_remote_host(host)?;
    let server = sqlx::query_as::<_, ServerPolicy>("SELECT * FROM servers WHERE host = $1")
        .bind(host)
        .fetch_optional(pool)
        .await?;
    if matches!(
        server.as_ref().map(|server| server.status.as_str()),
        Some("blocked")
    ) {
        return Err(ApiError::BlockedServer);
    }

    if server.is_none() {
        sqlx::query("INSERT INTO servers (id, host, status) VALUES ($1, $2, 'pending')")
            .bind(Uuid::now_v7())
            .bind(host)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub(crate) async fn record_activity(
    pool: &PgPool,
    direction: &str,
    remote_server: Option<&str>,
    activity: &Value,
    status: &str,
) -> ApiResult<()> {
    let activity_type = activity
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("Activity");
    let object_type = activity
        .get("object")
        .and_then(|object| object.get("type"))
        .and_then(Value::as_str)
        .unwrap_or("Object");
    let actor = activity
        .get("actor")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let activity_id = activity
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::now_v7().to_string());

    sqlx::query(
        r#"
        INSERT INTO activities
          (id, direction, remote_server, actor, activity_type, object_type, activity_id, payload, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(direction)
    .bind(remote_server)
    .bind(actor)
    .bind(activity_type)
    .bind(object_type)
    .bind(activity_id)
    .bind(activity)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(())
}

pub(crate) async fn deliver_activity(state: &AppState, remote_url: &str, activity: &Value) {
    let Ok(remote_url) = validate_remote_base_url(remote_url) else {
        warn!(remote_url, "refusing to deliver activity to unsafe remote");
        return;
    };
    let inbox_url = format!("{}/inbox", remote_url.trim_end_matches('/'));
    if let Err(error) = state.http.post(inbox_url).json(activity).send().await {
        warn!(%error, "failed to deliver federated activity");
    }
}

pub(crate) fn local_handle(username: &str, config: &Config) -> String {
    format!("{}@{}", username, config.host())
}

pub(crate) fn repo_path(config: &Config, username: &str, repo: &str) -> PathBuf {
    config
        .git_storage_path
        .join(normalize_path_segment(username))
        .join(format!("{}.git", normalize_path_segment(repo)))
}

pub(crate) fn normalize_path_segment(value: &str) -> String {
    value
        .chars()
        .filter(|char| char.is_ascii_alphanumeric() || *char == '-' || *char == '_')
        .collect()
}

pub(crate) fn repo_activity_url(config: &Config, repo: &Repository) -> String {
    repo.remote_url.clone().unwrap_or_else(|| {
        format!(
            "{}/{}/{}",
            config.app_base_url.trim_end_matches('/'),
            repo.owner_handle,
            repo.name
        )
    })
}

pub(crate) fn host_from_actor(actor: &str) -> Option<String> {
    reqwest::Url::parse(actor)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
}

pub(crate) fn validate_remote_base_url(value: &str) -> ApiResult<String> {
    let url = validate_remote_url(value)?;
    let host = url
        .host_str()
        .ok_or_else(|| ApiError::BadRequest("remote URL must include a host".to_string()))?;
    let mut base = format!("{}://{}", url.scheme(), host);
    if let Some(port) = url.port() {
        base.push_str(&format!(":{port}"));
    }
    Ok(base)
}

pub(crate) fn validate_remote_url(value: &str) -> ApiResult<reqwest::Url> {
    let url = reqwest::Url::parse(value.trim())
        .map_err(|_| ApiError::BadRequest("remote URL must be absolute".to_string()))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ApiError::BadRequest(
            "remote URL must use http or https".to_string(),
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ApiError::BadRequest(
            "remote URL must not include credentials".to_string(),
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| ApiError::BadRequest("remote URL must include a host".to_string()))?;
    ensure_safe_remote_host(host)?;
    Ok(url)
}

pub(crate) fn ensure_safe_remote_host(host: &str) -> ApiResult<()> {
    let normalized = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if normalized.is_empty()
        || normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized == "0"
    {
        return Err(ApiError::BadRequest("unsafe remote host".to_string()));
    }

    if let Ok(ip) = normalized.parse::<IpAddr>() {
        let unsafe_ip = match ip {
            IpAddr::V4(ip) => {
                ip.is_private()
                    || ip.is_loopback()
                    || ip.is_link_local()
                    || ip.is_multicast()
                    || ip.is_broadcast()
                    || ip.is_unspecified()
            }
            IpAddr::V6(ip) => {
                ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_multicast()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local()
            }
        };
        if unsafe_ip {
            return Err(ApiError::BadRequest("unsafe remote host".to_string()));
        }
    }

    Ok(())
}

pub(crate) fn activity_id(activity: &Activity) -> String {
    if activity.id.is_empty() {
        Uuid::now_v7().to_string()
    } else {
        activity.id.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_name_accepts_safe_repo_names() {
        assert_eq!(normalize_name("Diggit_API").unwrap(), "diggit_api");
        assert!(normalize_name("../bad").is_err());
    }

    #[test]
    fn reserved_owner_names_cannot_be_claimed() {
        assert!(ensure_claimable_owner_name("auth").is_err());
        assert!(ensure_claimable_owner_name("admin").is_err());
        assert!(ensure_claimable_owner_name("alice").is_ok());
    }

    #[test]
    fn host_from_actor_extracts_server_host() {
        assert_eq!(
            host_from_actor("https://example.com/actors/alice").unwrap(),
            "example.com"
        );
    }

    #[test]
    fn remote_url_validation_rejects_unsafe_targets() {
        assert!(validate_remote_url("https://example.com/repo").is_ok());
        assert!(validate_remote_url("ssh://example.com/repo").is_err());
        assert!(validate_remote_url("https://user@example.com/repo").is_err());
        assert!(validate_remote_url("http://localhost:3001/repo").is_err());
        assert!(validate_remote_url("http://127.0.0.1/repo").is_err());
        assert!(validate_remote_url("http://10.0.0.1/repo").is_err());
    }

    #[test]
    fn remote_base_url_uses_origin_only() {
        assert_eq!(
            validate_remote_base_url("https://example.com:8443/owner/repo").unwrap(),
            "https://example.com:8443"
        );
    }

    #[test]
    fn local_handle_uses_configured_host() {
        let config = Config {
            database_url: String::new(),
            redis_url: None,
            cache_ttl_seconds: 60,
            app_base_url: "https://git.example.com".to_string(),
            public_web_url: String::new(),
            git_storage_path: PathBuf::new(),
            jwt_secret: String::new(),
            admin_usernames: vec!["alice".to_string()],
            signups_enabled: true,
            ssh_host: "git.example.com".to_string(),
            ssh_port: 2222,
            port: 3001,
        };
        assert_eq!(local_handle("alice", &config), "alice@git.example.com");
    }

    #[test]
    fn admin_usernames_are_detected_from_config() {
        let config = Config {
            database_url: String::new(),
            redis_url: None,
            cache_ttl_seconds: 60,
            app_base_url: "https://git.example.com".to_string(),
            public_web_url: String::new(),
            git_storage_path: PathBuf::new(),
            jwt_secret: String::new(),
            admin_usernames: vec!["alice".to_string()],
            signups_enabled: true,
            ssh_host: "git.example.com".to_string(),
            ssh_port: 2222,
            port: 3001,
        };
        assert!(config.is_admin("alice"));
        assert!(!config.is_admin("bob"));
    }
}
