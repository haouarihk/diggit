use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde_json::{Value, json};
use tracing::warn;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

pub(crate) async fn webfinger(
    State(state): State<AppState>,
    Query(query): Query<WebfingerQuery>,
) -> ApiResult<Json<Value>> {
    let Some(username) = query.resource.strip_prefix("acct:") else {
        return Err(ApiError::BadRequest(
            "resource must be acct:user@host".to_string(),
        ));
    };
    let (username, host) = username
        .split_once('@')
        .ok_or_else(|| ApiError::BadRequest("resource must be acct:user@host".to_string()))?;
    if host != state.config.host() {
        return Err(ApiError::NotFound);
    }

    let user = get_user_by_username(&state.pool, username).await?;
    Ok(Json(json!({
        "subject": query.resource,
        "aliases": [user.actor_url],
        "links": [{
            "rel": "self",
            "type": "application/activity+json",
            "href": user.actor_url
        }]
    })))
}

pub(crate) async fn actor(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> ApiResult<Json<Value>> {
    let user = get_user_by_username(&state.pool, &username).await?;
    Ok(Json(json!({
        "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
        "id": user.actor_url,
        "type": "Person",
        "preferredUsername": user.username,
        "name": user.display_name,
        "inbox": user.inbox_url,
        "outbox": user.outbox_url,
        "url": format!("{}/{}", state.config.public_web_url.trim_end_matches('/'), user.username),
        "publicKey": {
            "id": format!("{}#main-key", user.actor_url),
            "owner": user.actor_url,
            "publicKeyPem": "development-key-placeholder"
        }
    })))
}

pub(crate) async fn outbox(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> ApiResult<Json<Value>> {
    let user = get_user_by_username(&state.pool, &username).await?;
    Ok(Json(json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": user.outbox_url,
        "type": "OrderedCollection",
        "totalItems": 0,
        "orderedItems": []
    })))
}

pub(crate) async fn inbox(
    State(state): State<AppState>,
    Json(activity): Json<Activity>,
) -> ApiResult<Json<Value>> {
    let remote_server = host_from_actor(&activity.actor)
        .ok_or_else(|| ApiError::BadRequest("activity actor must include a host".to_string()))?;
    enforce_rate_limit(&state, "federation-inbox", &remote_server, 120, 300).await?;
    ensure_server_allowed(&state.pool, &remote_server).await?;

    let object_type = activity
        .object
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("Object")
        .to_string();

    match (activity.activity_type.as_str(), object_type.as_str()) {
        ("Create", "RepositoryFork") => {
            accept_repository_fork(&state, &activity, &remote_server).await?
        }
        ("Offer", "PullRequest") => accept_pull_request(&state, &activity).await?,
        ("Create", "Note") => accept_comment(&state, &activity).await?,
        _ => warn!("accepted unsupported activity type for audit only"),
    }

    let payload = serde_json::to_value(&activity).unwrap_or_else(|_| json!({}));
    record_activity(
        &state.pool,
        "inbound",
        Some(&remote_server),
        &payload,
        "accepted",
    )
    .await?;
    Ok(Json(json!({ "status": "accepted" })))
}

pub(crate) async fn accept_repository_fork(
    state: &AppState,
    activity: &Activity,
    remote_server: &str,
) -> ApiResult<()> {
    let source_url = activity
        .object
        .get("source")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("fork source is required".to_string()))?;
    let fork_url = activity
        .object
        .get("fork")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("fork URL is required".to_string()))?;
    let source_url = validate_remote_url(source_url)?.to_string();
    let fork_url = validate_remote_url(fork_url)?.to_string();
    let name = activity
        .object
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("remote-fork");

    if let Some(source) = find_repo_by_activity_url(&state.pool, &source_url).await? {
        let fork_repo = sqlx::query_as::<_, Repository>(
            r#"
            INSERT INTO repositories
              (id, owner_id, owner_handle, name, description, visibility, local_path,
               remote_url, remote_server, source_repository_id, source_remote_url)
            VALUES ($1, NULL, $2, $3, 'Remote fork', 'public', '', $4, $5, $6, $7)
            ON CONFLICT (owner_handle, name)
            DO UPDATE SET remote_url = EXCLUDED.remote_url, updated_at = now()
            RETURNING *
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(activity.actor.clone())
        .bind(name)
        .bind(&fork_url)
        .bind(remote_server)
        .bind(source.id)
        .bind(&source_url)
        .fetch_one(&state.pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO repository_forks
              (id, source_repository_id, fork_repository_id, source_server, fork_server, remote_actor, activity_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (activity_id) DO NOTHING
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(source.id)
        .bind(fork_repo.id)
        .bind(state.config.host())
        .bind(remote_server)
        .bind(&activity.actor)
        .bind(activity_id(activity))
        .execute(&state.pool)
        .await?;
    }

    Ok(())
}

pub(crate) async fn accept_pull_request(state: &AppState, activity: &Activity) -> ApiResult<()> {
    let target_url = activity
        .object
        .get("target")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("pull request target is required".to_string()))?;
    let target_url = validate_remote_url(target_url)?.to_string();
    let target = find_repo_by_activity_url(&state.pool, &target_url)
        .await?
        .ok_or(ApiError::NotFound)?;
    let title = activity
        .object
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Federated pull request");

    sqlx::query(
        r#"
        INSERT INTO pull_requests
          (id, target_repository_id, title, body, author_handle, source_repo_url,
           source_branch, target_branch, status, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)
        ON CONFLICT (activity_id) DO NOTHING
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(target.id)
    .bind(title)
    .bind(
        activity
            .object
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or(""),
    )
    .bind(&activity.actor)
    .bind(
        validate_remote_url(
            activity
                .object
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or(""),
        )?
        .to_string(),
    )
    .bind(
        activity
            .object
            .get("sourceBranch")
            .and_then(Value::as_str)
            .unwrap_or("main"),
    )
    .bind(
        activity
            .object
            .get("targetBranch")
            .and_then(Value::as_str)
            .unwrap_or(&target.default_branch),
    )
    .bind(activity_id(activity))
    .execute(&state.pool)
    .await?;
    Ok(())
}

pub(crate) async fn accept_comment(state: &AppState, activity: &Activity) -> ApiResult<()> {
    let body = activity
        .object
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("note content is required".to_string()))?;
    sqlx::query(
        r#"
        INSERT INTO comments (id, author_handle, body, activity_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (activity_id) DO NOTHING
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(&activity.actor)
    .bind(body)
    .bind(activity_id(activity))
    .execute(&state.pool)
    .await?;
    Ok(())
}
