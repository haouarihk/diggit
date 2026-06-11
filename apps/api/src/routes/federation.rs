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
        ("Create", "Issue") => accept_issue(&state, &activity, &remote_server).await?,
        ("Update", "Issue") => accept_issue_update(&state, &activity).await?,
        ("Create", "Note") => accept_issue_comment(&state, &activity, &remote_server).await?,
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
          (target_repository_id, title, body, author_handle, source_repo_url,
           source_branch, target_branch, status, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)
        ON CONFLICT (activity_id) DO NOTHING
        "#,
    )
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

pub(crate) async fn accept_issue(
    state: &AppState,
    activity: &Activity,
    remote_server: &str,
) -> ApiResult<()> {
    let target_url = activity
        .object
        .get("target")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("issue target is required".to_string()))?;
    let target_url = validate_remote_url(target_url)?.to_string();
    let target = find_repo_by_activity_url(&state.pool, &target_url)
        .await?
        .ok_or(ApiError::NotFound)?;
    let title = activity
        .object
        .get("title")
        .and_then(Value::as_str)
        .or_else(|| activity.object.get("name").and_then(Value::as_str))
        .unwrap_or("Federated issue")
        .trim();
    if title.is_empty() {
        return Err(ApiError::BadRequest("issue title is required".to_string()));
    }
    let remote_url = activity
        .object
        .get("id")
        .and_then(Value::as_str)
        .map(validate_remote_url)
        .transpose()?
        .map(|url| url.to_string());
    if let Some(remote_url) = remote_url.as_deref() {
        let existing: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM issues WHERE remote_url = $1")
                .bind(remote_url)
                .fetch_optional(&state.pool)
                .await?;
        if existing.is_some() {
            return Ok(());
        }
    }

    sqlx::query(
        r#"
        INSERT INTO issues
          (id, repository_id, number, title, body, author_handle, author_actor_url,
           author_display_name, author_avatar_url, remote_server, remote_url, status, activity_id)
        SELECT $1, $2, COALESCE(MAX(number), 0) + 1, $3, $4, $5, $6, $7, $8, $9, $10, 'open', $11
        FROM issues
        WHERE repository_id = $2
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
    .bind(&activity.actor)
    .bind(
        activity
            .object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&activity.actor),
    )
    .bind(activity.object.get("icon").and_then(Value::as_str))
    .bind(remote_server)
    .bind(remote_url)
    .bind(activity_id(activity))
    .execute(&state.pool)
    .await?;
    Ok(())
}

pub(crate) async fn accept_issue_update(state: &AppState, activity: &Activity) -> ApiResult<()> {
    let issue_url = activity
        .object
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| activity.object.get("target").and_then(Value::as_str))
        .ok_or_else(|| ApiError::BadRequest("issue id is required".to_string()))?;
    let issue = find_issue_by_url(state, issue_url)
        .await?
        .ok_or(ApiError::NotFound)?;
    if issue.author_actor_url.as_deref() != Some(activity.actor.as_str()) {
        return Err(ApiError::Unauthorized);
    }
    let status = activity
        .object
        .get("status")
        .and_then(Value::as_str)
        .filter(|status| matches!(*status, "open" | "closed"));

    sqlx::query(
        r#"
        UPDATE issues
        SET title = COALESCE($2, title),
            body = COALESCE($3, body),
            status = COALESCE($4, status),
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(issue.id)
    .bind(activity.object.get("title").and_then(Value::as_str))
    .bind(activity.object.get("body").and_then(Value::as_str))
    .bind(status)
    .execute(&state.pool)
    .await?;
    Ok(())
}

pub(crate) async fn accept_issue_comment(
    state: &AppState,
    activity: &Activity,
    remote_server: &str,
) -> ApiResult<()> {
    let body = activity
        .object
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("note content is required".to_string()))?;
    let target_url = activity
        .object
        .get("target")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::BadRequest("note target is required".to_string()))?;
    let issue = find_issue_by_url(state, target_url)
        .await?
        .ok_or(ApiError::NotFound)?;

    sqlx::query(
        r#"
        INSERT INTO comments
          (id, repository_id, issue_id, author_handle, author_actor_url,
           author_display_name, author_avatar_url, remote_server, body, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (activity_id) DO NOTHING
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(issue.repository_id)
    .bind(issue.id)
    .bind(&activity.actor)
    .bind(&activity.actor)
    .bind(
        activity
            .object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&activity.actor),
    )
    .bind(activity.object.get("icon").and_then(Value::as_str))
    .bind(remote_server)
    .bind(body)
    .bind(activity_id(activity))
    .execute(&state.pool)
    .await?;
    Ok(())
}

async fn find_issue_by_url(state: &AppState, issue_url: &str) -> ApiResult<Option<Issue>> {
    let issue_url = validate_remote_url(issue_url)?.to_string();
    let stored = sqlx::query_as::<_, Issue>("SELECT * FROM issues WHERE remote_url = $1")
        .bind(&issue_url)
        .fetch_optional(&state.pool)
        .await?;
    if stored.is_some() {
        return Ok(stored);
    }

    let url = reqwest::Url::parse(&issue_url)
        .map_err(|_| ApiError::BadRequest("issue URL must be absolute".to_string()))?;
    let segments: Vec<&str> = url
        .path_segments()
        .map(|segments| segments.filter(|segment| !segment.is_empty()).collect())
        .unwrap_or_default();
    if segments.len() < 4 || segments[segments.len() - 2] != "issues" {
        return Ok(None);
    }
    let number = segments[segments.len() - 1]
        .parse::<i32>()
        .map_err(|_| ApiError::BadRequest("issue number is invalid".to_string()))?;
    let owner = segments[segments.len() - 4];
    let name = segments[segments.len() - 3];
    let repo = find_repo(&state.pool, owner, name).await?;

    Ok(
        sqlx::query_as::<_, Issue>("SELECT * FROM issues WHERE repository_id = $1 AND number = $2")
            .bind(repo.id)
            .bind(number)
            .fetch_optional(&state.pool)
            .await?,
    )
}
