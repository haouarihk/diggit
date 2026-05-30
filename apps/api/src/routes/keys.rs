use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::ApiResult, models::*, services::*, state::AppState};

pub(crate) async fn list_ssh_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let keys = sqlx::query_as::<_, SshKey>(
        "SELECT * FROM ssh_keys WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(auth.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "data": keys })))
}

pub(crate) async fn create_ssh_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateSshKeyRequest>,
) -> ApiResult<Json<SshKey>> {
    let auth = require_auth(&state, &headers)?;
    let fingerprint = ssh_key_fingerprint(&input.public_key)?;
    let key = sqlx::query_as::<_, SshKey>(
        r#"
        INSERT INTO ssh_keys (id, user_id, title, public_key, fingerprint)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(auth.id)
    .bind(input.title)
    .bind(input.public_key.trim())
    .bind(fingerprint)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(key))
}

pub(crate) async fn delete_ssh_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    sqlx::query("DELETE FROM ssh_keys WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(auth.id)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "status": "deleted" })))
}
