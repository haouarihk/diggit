use std::{env, net::SocketAddr, sync::Arc};

use reqwest::Client;
use sqlx::postgres::PgPoolOptions;
use tokio::fs;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;
mod models;
mod routes;
mod services;
mod state;

use config::Config;
use state::{AppState, Cache};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG").unwrap_or_else(|_| "diggit_api=info,tower_http=info".to_string()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(Config::from_env());
    fs::create_dir_all(&config.git_storage_path).await?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = AppState {
        pool,
        config: config.clone(),
        http: Client::new(),
        cache: Cache::new(config.redis_url.as_deref(), config.cache_ttl_seconds),
    };

    let app = routes::router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("diggit api listening on http://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}
