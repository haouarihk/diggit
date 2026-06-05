use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

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

pub(crate) async fn list_org_runner_secrets(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<String>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    list_runner_config(&state, "runner_secrets", None, Some(organization.id)).await
}

pub(crate) async fn upsert_org_runner_secret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<String>,
    Json(input): Json<UpsertRunnerSecretRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    upsert_runner_config(
        &state,
        "runner_secrets",
        "organization",
        None,
        Some(organization.id),
        &input.name,
        &input.value,
        input.environment.as_deref(),
        false,
    )
    .await
}

pub(crate) async fn delete_org_runner_secret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((org, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    delete_runner_config(&state, "runner_secrets", None, Some(organization.id), &name).await
}

pub(crate) async fn list_repo_runner_secrets(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    list_runner_config(&state, "runner_secrets", Some(repo.id), None).await
}

pub(crate) async fn upsert_repo_runner_secret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<UpsertRunnerSecretRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    upsert_runner_config(
        &state,
        "runner_secrets",
        "repository",
        Some(repo.id),
        None,
        &input.name,
        &input.value,
        input.environment.as_deref(),
        false,
    )
    .await
}

pub(crate) async fn delete_repo_runner_secret(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, repo_name, secret_name)): Path<(String, String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &repo_name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    delete_runner_config(&state, "runner_secrets", Some(repo.id), None, &secret_name).await
}

pub(crate) async fn list_org_runner_variables(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<String>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    list_runner_config(&state, "runner_variables", None, Some(organization.id)).await
}

pub(crate) async fn upsert_org_runner_variable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(org): Path<String>,
    Json(input): Json<UpsertRunnerVariableRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    upsert_runner_config(
        &state,
        "runner_variables",
        "organization",
        None,
        Some(organization.id),
        &input.name,
        &input.value,
        input.environment.as_deref(),
        true,
    )
    .await
}

pub(crate) async fn delete_org_runner_variable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((org, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &org).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    delete_runner_config(
        &state,
        "runner_variables",
        None,
        Some(organization.id),
        &name,
    )
    .await
}

pub(crate) async fn list_repo_runner_variables(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    list_runner_config(&state, "runner_variables", Some(repo.id), None).await
}

pub(crate) async fn upsert_repo_runner_variable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<UpsertRunnerVariableRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    upsert_runner_config(
        &state,
        "runner_variables",
        "repository",
        Some(repo.id),
        None,
        &input.name,
        &input.value,
        input.environment.as_deref(),
        true,
    )
    .await
}

pub(crate) async fn delete_repo_runner_variable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, repo_name, variable_name)): Path<(String, String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &repo_name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    delete_runner_config(
        &state,
        "runner_variables",
        Some(repo.id),
        None,
        &variable_name,
    )
    .await
}

pub(crate) async fn register_runner(
    State(state): State<AppState>,
    Json(input): Json<RegisterRunnerRequest>,
) -> ApiResult<Json<RegisterRunnerResponse>> {
    let registration_token_hash = token_hash(&input.token);
    enforce_rate_limit(&state, "runner-register", &registration_token_hash, 20, 300).await?;
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
    let token = bearer_token(&headers).ok_or(crate::error::ApiError::Unauthorized)?;
    let result = sqlx::query(
        "UPDATE runners SET last_seen_at = now(), status = 'online' WHERE token_hash = $1",
    )
    .bind(token_hash(token))
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(crate::error::ApiError::Unauthorized);
    }

    Ok(Json(json!({
        "task": null,
        "message": "no task available",
        "nextPollSeconds": 5
    })))
}

async fn list_runner_config(
    state: &AppState,
    table: &str,
    repository_id: Option<Uuid>,
    organization_id: Option<Uuid>,
) -> ApiResult<Json<Value>> {
    let rows = if table == "runner_variables" {
        sqlx::query(
            r#"
            SELECT id, name, environment, value, created_at, updated_at
            FROM runner_variables
            WHERE ($1::UUID IS NULL OR repository_id = $1)
              AND ($2::UUID IS NULL OR organization_id = $2)
            ORDER BY environment NULLS FIRST, name ASC
            "#,
        )
        .bind(repository_id)
        .bind(organization_id)
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": row.get::<Uuid, _>("id"),
                "name": row.get::<String, _>("name"),
                "environment": row.get::<Option<String>, _>("environment"),
                "value": row.get::<String, _>("value"),
                "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "updated_at": row.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>()
    } else {
        sqlx::query(
            r#"
            SELECT id, name, environment, created_at, updated_at
            FROM runner_secrets
            WHERE ($1::UUID IS NULL OR repository_id = $1)
              AND ($2::UUID IS NULL OR organization_id = $2)
            ORDER BY environment NULLS FIRST, name ASC
            "#,
        )
        .bind(repository_id)
        .bind(organization_id)
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|row| {
            json!({
                "id": row.get::<Uuid, _>("id"),
                "name": row.get::<String, _>("name"),
                "environment": row.get::<Option<String>, _>("environment"),
                "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "updated_at": row.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>()
    };

    Ok(Json(json!({ "data": rows })))
}

#[allow(clippy::too_many_arguments)]
async fn upsert_runner_config(
    state: &AppState,
    table: &str,
    scope_kind: &str,
    repository_id: Option<Uuid>,
    organization_id: Option<Uuid>,
    name: &str,
    value: &str,
    environment: Option<&str>,
    returns_value: bool,
) -> ApiResult<Json<Value>> {
    let name = normalize_config_name(name)?;
    let environment = normalize_environment(environment);
    if value.is_empty() {
        return Err(ApiError::BadRequest("value is required".to_string()));
    }

    let existing: Option<(Uuid,)> = if table == "runner_variables" {
        sqlx::query_as(
            r#"
            SELECT id
            FROM runner_variables
            WHERE ($1::UUID IS NULL OR repository_id = $1)
              AND ($2::UUID IS NULL OR organization_id = $2)
              AND COALESCE(environment, '') = COALESCE($3, '')
              AND lower(name) = lower($4)
            "#,
        )
        .bind(repository_id)
        .bind(organization_id)
        .bind(&environment)
        .bind(&name)
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_as(
            r#"
            SELECT id
            FROM runner_secrets
            WHERE ($1::UUID IS NULL OR repository_id = $1)
              AND ($2::UUID IS NULL OR organization_id = $2)
              AND COALESCE(environment, '') = COALESCE($3, '')
              AND lower(name) = lower($4)
            "#,
        )
        .bind(repository_id)
        .bind(organization_id)
        .bind(&environment)
        .bind(&name)
        .fetch_optional(&state.pool)
        .await?
    };

    let id = existing.map(|(id,)| id).unwrap_or_else(Uuid::now_v7);
    if table == "runner_variables" {
        sqlx::query(
            r#"
            INSERT INTO runner_variables
              (id, scope_kind, repository_id, organization_id, environment, name, value)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE
            SET environment = EXCLUDED.environment,
                name = EXCLUDED.name,
                value = EXCLUDED.value,
                updated_at = now()
            "#,
        )
        .bind(id)
        .bind(scope_kind)
        .bind(repository_id)
        .bind(organization_id)
        .bind(&environment)
        .bind(&name)
        .bind(value)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO runner_secrets
              (id, scope_kind, repository_id, organization_id, environment, name, value)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE
            SET environment = EXCLUDED.environment,
                name = EXCLUDED.name,
                value = EXCLUDED.value,
                updated_at = now()
            "#,
        )
        .bind(id)
        .bind(scope_kind)
        .bind(repository_id)
        .bind(organization_id)
        .bind(&environment)
        .bind(&name)
        .bind(value)
        .execute(&state.pool)
        .await?;
    }

    Ok(Json(json!({
        "id": id,
        "name": name,
        "environment": environment,
        "value": if returns_value { Some(value) } else { None::<&str> },
    })))
}

async fn delete_runner_config(
    state: &AppState,
    table: &str,
    repository_id: Option<Uuid>,
    organization_id: Option<Uuid>,
    name: &str,
) -> ApiResult<Json<Value>> {
    let name = normalize_config_name(name)?;
    let rows_affected = if table == "runner_variables" {
        sqlx::query(
            r#"
            DELETE FROM runner_variables
            WHERE ($1::UUID IS NULL OR repository_id = $1)
              AND ($2::UUID IS NULL OR organization_id = $2)
              AND lower(name) = lower($3)
            "#,
        )
        .bind(repository_id)
        .bind(organization_id)
        .bind(&name)
        .execute(&state.pool)
        .await?
        .rows_affected()
    } else {
        sqlx::query(
            r#"
            DELETE FROM runner_secrets
            WHERE ($1::UUID IS NULL OR repository_id = $1)
              AND ($2::UUID IS NULL OR organization_id = $2)
              AND lower(name) = lower($3)
            "#,
        )
        .bind(repository_id)
        .bind(organization_id)
        .bind(&name)
        .execute(&state.pool)
        .await?
        .rows_affected()
    };

    if rows_affected == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({ "status": "deleted" })))
}

fn normalize_config_name(value: &str) -> ApiResult<String> {
    let normalized = value.trim().to_ascii_uppercase();
    let valid = !normalized.is_empty()
        && normalized
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '_');
    if valid {
        Ok(normalized)
    } else {
        Err(ApiError::BadRequest(
            "name must contain only letters, numbers, and underscores".to_string(),
        ))
    }
}

fn normalize_environment(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}
