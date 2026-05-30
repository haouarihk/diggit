use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::ApiResult, models::*, services::*, state::AppState};

pub(crate) async fn create_server_runner_token(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<RunnerTokenResponse>> {
    let auth = require_auth(&state, &headers)?;
    require_admin(&state, &auth)?;
    create_runner_token(&state.pool, "server", None, None, None, auth.id).await
}

pub(crate) async fn create_user_runner_token(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<RunnerTokenResponse>> {
    let auth = require_auth(&state, &headers)?;
    create_runner_token(&state.pool, "user", Some(auth.id), None, None, auth.id).await
}

pub(crate) async fn create_org_runner_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<String>,
) -> ApiResult<Json<RunnerTokenResponse>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_member(&state.pool, organization.id, auth.id).await?;
    create_runner_token(
        &state.pool,
        "organization",
        None,
        Some(organization.id),
        None,
        auth.id,
    )
    .await
}

pub(crate) async fn create_repo_runner_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RunnerTokenResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    let namespace_owner = repo.owner_handle.clone();
    resolve_writable_namespace(&state.pool, &auth, &namespace_owner).await?;
    create_runner_token(
        &state.pool,
        "repository",
        None,
        None,
        Some(repo.id),
        auth.id,
    )
    .await
}

pub(crate) async fn list_server_runners(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    require_admin(&state, &auth)?;
    list_runners(&state.pool, "server", None, None, None).await
}

pub(crate) async fn list_user_runners(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    list_runners(&state.pool, "user", Some(auth.id), None, None).await
}

pub(crate) async fn list_org_runners(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<String>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_member(&state.pool, organization.id, auth.id).await?;
    list_runners(
        &state.pool,
        "organization",
        None,
        Some(organization.id),
        None,
    )
    .await
}

pub(crate) async fn list_repo_runners(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    let namespace_owner = repo.owner_handle.clone();
    resolve_writable_namespace(&state.pool, &auth, &namespace_owner).await?;
    list_runners(&state.pool, "repository", None, None, Some(repo.id)).await
}

pub(crate) async fn register_runner(
    State(state): State<AppState>,
    Json(input): Json<RegisterRunnerRequest>,
) -> ApiResult<Json<RegisterRunnerResponse>> {
    let registration_token_hash = token_hash(&input.token);
    let token: (String, Option<Uuid>, Option<Uuid>, Option<Uuid>) = sqlx::query_as(
        r#"
        SELECT scope_kind, user_id, organization_id, repository_id
        FROM runner_registration_tokens
        WHERE token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
        "#,
    )
    .bind(registration_token_hash)
    .fetch_one(&state.pool)
    .await?;

    let runner_token = generate_token("runner");
    let labels = parse_runner_labels(input.labels.as_deref());
    let id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO runners
          (id, token_hash, scope_kind, user_id, organization_id, repository_id, name, labels, version, status, last_seen_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'online', now())
        "#,
    )
    .bind(id)
    .bind(token_hash(&runner_token))
    .bind(token.0)
    .bind(token.1)
    .bind(token.2)
    .bind(token.3)
    .bind(input.name.unwrap_or_else(|| "diggit-runner".to_string()))
    .bind(labels)
    .bind(input.version)
    .execute(&state.pool)
    .await?;

    Ok(Json(RegisterRunnerResponse {
        id,
        token: runner_token,
    }))
}

pub(crate) async fn fetch_runner_task(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    if let Some(token) = bearer_token(&headers) {
        sqlx::query(
            "UPDATE runners SET last_seen_at = now(), status = 'online' WHERE token_hash = $1",
        )
        .bind(token_hash(token))
        .execute(&state.pool)
        .await?;
    }

    Ok(Json(json!({
        "task": null,
        "message": "no task available",
        "nextPollSeconds": 5
    })))
}
