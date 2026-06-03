use std::sync::Arc;

use redis::AsyncCommands;
use reqwest::Client;
use serde::{Serialize, de::DeserializeOwned};
use sqlx::PgPool;
use tracing::warn;

use crate::config::Config;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) pool: PgPool,
    pub(crate) config: Arc<Config>,
    pub(crate) http: Client,
    pub(crate) cache: Cache,
}

#[derive(Clone)]
pub(crate) struct Cache {
    pub(crate) client: Option<redis::Client>,
    pub(crate) ttl_seconds: u64,
}

impl Cache {
    pub(crate) fn new(redis_url: Option<&str>, ttl_seconds: u64) -> Self {
        let client = redis_url.and_then(|url| match redis::Client::open(url) {
            Ok(client) => Some(client),
            Err(error) => {
                warn!(%error, "redis cache disabled");
                None
            }
        });

        Self {
            client,
            ttl_seconds,
        }
    }

    pub(crate) async fn get_json<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        let client = self.client.as_ref()?;
        let mut connection = client.get_multiplexed_async_connection().await.ok()?;
        let value: Option<String> = connection.get(key).await.ok()?;
        value.and_then(|value| serde_json::from_str(&value).ok())
    }

    pub(crate) async fn set_json<T: Serialize>(&self, key: &str, value: &T) {
        let Some(client) = self.client.as_ref() else {
            return;
        };
        let Ok(serialized) = serde_json::to_string(value) else {
            return;
        };
        let Ok(mut connection) = client.get_multiplexed_async_connection().await else {
            return;
        };
        let result: redis::RedisResult<()> =
            connection.set_ex(key, serialized, self.ttl_seconds).await;
        if let Err(error) = result {
            warn!(%error, "failed to write redis cache");
        }
    }

    pub(crate) async fn delete_pattern(&self, pattern: &str) {
        let Some(client) = self.client.as_ref() else {
            return;
        };
        let Ok(mut connection) = client.get_multiplexed_async_connection().await else {
            return;
        };
        let keys: redis::RedisResult<Vec<String>> = redis::cmd("KEYS")
            .arg(pattern)
            .query_async(&mut connection)
            .await;
        let Ok(keys) = keys else {
            return;
        };
        if keys.is_empty() {
            return;
        }
        let result: redis::RedisResult<()> = connection.del(keys).await;
        if let Err(error) = result {
            warn!(%error, "failed to invalidate redis cache");
        }
    }

    pub(crate) async fn is_rate_limited(&self, key: &str, limit: u64, window_seconds: u64) -> bool {
        let Some(client) = self.client.as_ref() else {
            return false;
        };
        let Ok(mut connection) = client.get_multiplexed_async_connection().await else {
            return false;
        };

        let count: redis::RedisResult<u64> = redis::cmd("INCR")
            .arg(key)
            .query_async(&mut connection)
            .await;
        let Ok(count) = count else {
            return false;
        };
        if count == 1 {
            let _: redis::RedisResult<()> = redis::cmd("EXPIRE")
                .arg(key)
                .arg(window_seconds)
                .query_async(&mut connection)
                .await;
        }

        count > limit
    }
}
