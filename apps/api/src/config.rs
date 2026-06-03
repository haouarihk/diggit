use std::{env, path::PathBuf};

#[derive(Clone)]
pub(crate) struct Config {
    pub(crate) database_url: String,
    pub(crate) redis_url: Option<String>,
    pub(crate) cache_ttl_seconds: u64,
    pub(crate) app_base_url: String,
    pub(crate) public_web_url: String,
    pub(crate) git_storage_path: PathBuf,
    pub(crate) jwt_secret: String,
    pub(crate) admin_usernames: Vec<String>,
    pub(crate) signups_enabled: bool,
    pub(crate) ssh_host: String,
    pub(crate) ssh_port: u16,
    pub(crate) port: u16,
}

impl Config {
    pub(crate) fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://diggit:diggit@localhost:5432/diggit".to_string()),
            redis_url: env::var("REDIS_URL")
                .ok()
                .filter(|url| !url.trim().is_empty()),
            cache_ttl_seconds: env::var("CACHE_TTL_SECONDS")
                .ok()
                .and_then(|seconds| seconds.parse().ok())
                .unwrap_or(60),
            app_base_url: env::var("APP_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:3001".to_string()),
            public_web_url: env::var("PUBLIC_WEB_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            git_storage_path: env::var("GIT_STORAGE_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("./storage/git")),
            jwt_secret: jwt_secret_from_env(),
            admin_usernames: env::var("ADMIN_USERNAMES")
                .unwrap_or_default()
                .split(',')
                .map(|username| username.trim().to_ascii_lowercase())
                .filter(|username| !username.is_empty())
                .collect(),
            signups_enabled: env_bool("SIGNUPS_ENABLED", true),
            ssh_host: env::var("SSH_HOST").unwrap_or_else(|_| {
                env::var("PUBLIC_WEB_URL")
                    .unwrap_or_else(|_| "localhost".to_string())
                    .trim_start_matches("https://")
                    .trim_start_matches("http://")
                    .trim_end_matches('/')
                    .to_string()
            }),
            ssh_port: env::var("SSH_PORT")
                .ok()
                .and_then(|port| port.parse().ok())
                .unwrap_or(22),
            port: env::var("PORT")
                .ok()
                .and_then(|port| port.parse().ok())
                .unwrap_or(3001),
        }
    }

    pub(crate) fn host(&self) -> String {
        self.app_base_url
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string()
    }

    pub(crate) fn actor_url(&self, username: &str) -> String {
        format!(
            "{}/actors/{}",
            self.app_base_url.trim_end_matches('/'),
            username
        )
    }

    pub(crate) fn is_admin(&self, username: &str) -> bool {
        self.admin_usernames
            .iter()
            .any(|admin| admin == &username.to_ascii_lowercase())
    }
}

fn env_bool(name: &str, default: bool) -> bool {
    match env::var(name) {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => default,
    }
}

fn jwt_secret_from_env() -> String {
    match env::var("JWT_SECRET") {
        Ok(secret) if secret.len() >= 32 && secret != "dev-secret-change-me" => secret,
        Ok(_) if cfg!(debug_assertions) => "dev-secret-change-me".to_string(),
        Ok(_) => panic!("JWT_SECRET must be at least 32 characters and not use the dev default"),
        Err(_) if cfg!(debug_assertions) => "dev-secret-change-me".to_string(),
        Err(_) => panic!("JWT_SECRET must be set in production"),
    }
}
