use axum::{Json, extract::State, http::HeaderMap};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

pub(crate) async fn list_servers(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let servers = sqlx::query_as::<_, ServerPolicy>("SELECT * FROM servers ORDER BY host ASC")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(json!({ "data": servers })))
}

pub(crate) async fn upsert_server(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<UpsertServerRequest>,
) -> ApiResult<Json<ServerPolicy>> {
    require_auth(&state, &headers)?;
    if !matches!(input.status.as_str(), "allowed" | "blocked" | "pending") {
        return Err(ApiError::BadRequest("invalid server status".to_string()));
    }

    let server = sqlx::query_as::<_, ServerPolicy>(
        r#"
        INSERT INTO servers (id, host, status, reason)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (host)
        DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, updated_at = now()
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(input.host)
    .bind(input.status)
    .bind(input.reason)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(server))
}

pub(crate) async fn list_activities(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let activities = sqlx::query_as::<_, ActivityRow>(
        "SELECT * FROM activities ORDER BY created_at DESC LIMIT 100",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "data": activities })))
}
