use axum::{
    Json,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use sqlx::Row;
use std::path::PathBuf;
use tokio::fs;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

pub(crate) async fn create_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateRepoRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_auth(&state, &headers)?;
    let name = normalize_name(&input.name)?;
    let visibility = input.visibility.unwrap_or_else(|| "public".to_string());
    if visibility != "public" && visibility != "private" {
        return Err(ApiError::BadRequest("invalid visibility".to_string()));
    }

    let owner_name = input.owner.as_deref().unwrap_or(&auth.username);
    let namespace = resolve_writable_namespace(&state.pool, &auth, owner_name).await?;
    let existing: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM repositories WHERE owner_handle = $1 AND name = $2")
            .bind(&namespace.name)
            .bind(&name)
            .fetch_optional(&state.pool)
            .await?;
    if existing.is_some() {
        return Err(ApiError::Conflict(format!(
            "repository {}/{} already exists",
            namespace.name, name
        )));
    }

    let local_path = repo_path(&state.config, &namespace.name, &name);
    create_bare_repo(&local_path).await?;

    let repo = sqlx::query_as::<_, Repository>(
        r#"
        INSERT INTO repositories
          (id, namespace_id, owner_id, owner_handle, name, description, visibility, local_path)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(namespace.id)
    .bind(auth.id)
    .bind(&namespace.name)
    .bind(name)
    .bind(input.description.unwrap_or_default())
    .bind(visibility)
    .bind(local_path.to_string_lossy().to_string())
    .fetch_one(&state.pool)
    .await?;

    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, repo).await?,
    ))
}

pub(crate) async fn delete_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let local_path = PathBuf::from(&repo.local_path);

    sqlx::query("DELETE FROM repositories WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;

    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;

    if fs::try_exists(&local_path).await? {
        fs::remove_dir_all(&local_path).await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn update_repo_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<UpdateRepoSettingsRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;

    let old_owner = repo.owner_handle.clone();
    let old_name = repo.name.clone();
    let next_name = match input.name.as_deref() {
        Some(value) => normalize_name(value)?,
        None => repo.name.clone(),
    };
    let next_visibility = match input.visibility.as_deref() {
        Some("public" | "private") => input.visibility.clone().unwrap(),
        Some(_) => return Err(ApiError::BadRequest("invalid visibility".to_string())),
        None => repo.visibility.clone(),
    };
    let next_policy = match input.pull_request_policy.as_deref() {
        Some("anyone" | "collaborators") => input.pull_request_policy.clone().unwrap(),
        Some(_) => {
            return Err(ApiError::BadRequest(
                "invalid pull request policy".to_string(),
            ));
        }
        None => repo.pull_request_policy.clone(),
    };
    let next_default_branch = input
        .default_branch
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| repo.default_branch.clone());

    if next_name != repo.name {
        let existing: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM repositories WHERE owner_handle = $1 AND name = $2")
                .bind(&repo.owner_handle)
                .bind(&next_name)
                .fetch_optional(&state.pool)
                .await?;
        if existing.is_some() {
            return Err(ApiError::Conflict(format!(
                "repository {}/{} already exists",
                repo.owner_handle, next_name
            )));
        }
    }

    validate_default_branch(&repo, &next_default_branch).await?;

    let next_local_path = repo_path(&state.config, &repo.owner_handle, &next_name);
    if next_name != repo.name {
        move_repo_storage(&repo.local_path, &next_local_path).await?;
    }

    let updated = sqlx::query_as::<_, Repository>(
        r#"
        UPDATE repositories
        SET name = $2,
            visibility = $3,
            default_branch = $4,
            issues_enabled = $5,
            pull_requests_enabled = $6,
            pull_request_policy = $7,
            local_path = $8,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(repo.id)
    .bind(next_name)
    .bind(next_visibility)
    .bind(next_default_branch)
    .bind(input.issues_enabled.unwrap_or(repo.issues_enabled))
    .bind(
        input
            .pull_requests_enabled
            .unwrap_or(repo.pull_requests_enabled),
    )
    .bind(next_policy)
    .bind(next_local_path.to_string_lossy().to_string())
    .fetch_one(&state.pool)
    .await?;

    invalidate_repo_cache(&state, &old_owner, &old_name).await;
    invalidate_repo_cache(&state, &updated.owner_handle, &updated.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, updated).await?,
    ))
}

pub(crate) async fn transfer_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<TransferRepoRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let namespace = resolve_writable_namespace(&state.pool, &auth, &input.owner).await?;

    if namespace.name == repo.owner_handle {
        return Ok(Json(
            repository_response(&state.pool, &state.config, repo).await?,
        ));
    }

    let existing: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM repositories WHERE owner_handle = $1 AND name = $2")
            .bind(&namespace.name)
            .bind(&repo.name)
            .fetch_optional(&state.pool)
            .await?;
    if existing.is_some() {
        return Err(ApiError::Conflict(format!(
            "repository {}/{} already exists",
            namespace.name, repo.name
        )));
    }

    let old_owner = repo.owner_handle.clone();
    let old_name = repo.name.clone();
    let next_local_path = repo_path(&state.config, &namespace.name, &repo.name);
    move_repo_storage(&repo.local_path, &next_local_path).await?;

    let updated = sqlx::query_as::<_, Repository>(
        r#"
        UPDATE repositories
        SET namespace_id = $2,
            owner_id = $3,
            owner_handle = $4,
            local_path = $5,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(repo.id)
    .bind(namespace.id)
    .bind(namespace.user_id)
    .bind(&namespace.name)
    .bind(next_local_path.to_string_lossy().to_string())
    .fetch_one(&state.pool)
    .await?;

    invalidate_repo_cache(&state, &old_owner, &old_name).await;
    invalidate_repo_cache(&state, &updated.owner_handle, &updated.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, updated).await?,
    ))
}

pub(crate) async fn archive_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<ArchiveRepoRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let updated = sqlx::query_as::<_, Repository>(
        r#"
        UPDATE repositories
        SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(repo.id)
    .bind(input.archived)
    .fetch_one(&state.pool)
    .await?;

    invalidate_repo_cache(&state, &updated.owner_handle, &updated.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, updated).await?,
    ))
}

pub(crate) async fn list_repo_collaborators(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let collaborators = sqlx::query(
        r#"
        SELECT users.id, users.username, users.display_name, users.avatar_url,
               repository_collaborators.permission, repository_collaborators.created_at
        FROM repository_collaborators
        JOIN users ON users.id = repository_collaborators.user_id
        WHERE repository_collaborators.repository_id = $1
        ORDER BY users.username ASC
        "#,
    )
    .bind(repo.id)
    .fetch_all(&state.pool)
    .await?;

    let data = collaborators
        .into_iter()
        .map(|row| {
            json!({
                "id": row.get::<Uuid, _>("id"),
                "username": row.get::<String, _>("username"),
                "display_name": row.get::<String, _>("display_name"),
                "avatar_url": row.get::<Option<String>, _>("avatar_url"),
                "permission": row.get::<String, _>("permission"),
                "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(json!({ "data": data })))
}

pub(crate) async fn upsert_repo_collaborator(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<UpsertCollaboratorRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let user = get_user_by_username(&state.pool, &normalize_name(&input.username)?).await?;
    let permission = normalize_repo_permission(input.permission.as_deref().unwrap_or("write"))?;

    sqlx::query(
        r#"
        INSERT INTO repository_collaborators (repository_id, user_id, permission)
        VALUES ($1, $2, $3)
        ON CONFLICT (repository_id, user_id) DO UPDATE
        SET permission = EXCLUDED.permission
        "#,
    )
    .bind(repo.id)
    .bind(user.id)
    .bind(&permission)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "username": user.username,
        "display_name": user.display_name,
        "permission": permission,
    })))
}

pub(crate) async fn delete_repo_collaborator(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, username)): Path<(String, String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let user = get_user_by_username(&state.pool, &normalize_name(&username)?).await?;
    let result = sqlx::query(
        "DELETE FROM repository_collaborators WHERE repository_id = $1 AND user_id = $2",
    )
    .bind(repo.id)
    .bind(user.id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({ "status": "deleted" })))
}

pub(crate) async fn list_repos(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let cache_key = cache_key(&["repos", "list"]);
    if let Some(cached) = state.cache.get_json::<Value>(&cache_key).await {
        return Ok(Json(cached));
    }

    let repos = public_repositories(&state.pool).await?;
    let mut responses = Vec::with_capacity(repos.len());
    for repo in repos {
        responses.push(repository_response(&state.pool, &state.config, repo).await?);
    }
    let response = json!({ "data": responses });
    state.cache.set_json(&cache_key, &response).await;
    Ok(Json(response))
}

pub(crate) async fn get_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-tree", &format!("{owner}/{name}"), 120, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let response = repository_response(&state.pool, &state.config, repo).await?;
    Ok(Json(response))
}

pub(crate) async fn list_repo_tree(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoTreeQuery>,
) -> ApiResult<Json<RepositoryTreeResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-tree", &format!("{owner}/{name}"), 120, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let ref_name = query
        .ref_name
        .as_deref()
        .unwrap_or(&repo.default_branch)
        .to_string();
    let Some(commit_sha) = resolve_git_ref(&repo, query.ref_name.as_deref()).await? else {
        let response = RepositoryTreeResponse {
            ref_name,
            last_commit: None,
            entries: Vec::new(),
        };
        return Ok(Json(response));
    };
    let tree = run_git_command(
        &repo,
        &["ls-tree".to_string(), "-l".to_string(), commit_sha.clone()],
    )
    .await?;
    let mut entries = Vec::new();

    for line in tree.lines() {
        if let Some((name, kind, size)) = parse_ls_tree_line(line) {
            let path = name.clone();
            let last_commit = git_last_commit(&repo, &commit_sha, Some(&path)).await?;
            entries.push(RepositoryTreeEntryResponse {
                extension: file_extension(&name),
                name,
                path,
                kind,
                size,
                last_commit,
            });
        }
    }

    let response = RepositoryTreeResponse {
        ref_name,
        last_commit: git_last_commit(&repo, &commit_sha, None).await?,
        entries,
    };
    Ok(Json(response))
}

pub(crate) async fn list_repo_branches(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryBranchListResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-branches", &format!("{owner}/{name}"), 120, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(RepositoryBranchListResponse {
        data: list_branches(&repo).await?,
    }))
}

pub(crate) async fn get_repo_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoFileQuery>,
) -> ApiResult<Json<RepositoryFileResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-file", &format!("{owner}/{name}"), 120, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let path = normalize_repo_file_path(&query.path)?;
    let response = repo_file_response(&repo, &path, query.ref_name.as_deref()).await?;
    Ok(Json(response))
}

pub(crate) async fn get_repo_raw_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoFileQuery>,
) -> ApiResult<Response> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-raw", &format!("{owner}/{name}"), 60, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let path = normalize_repo_file_path(&query.path)?;
    let commit_sha = resolve_git_ref(&repo, query.ref_name.as_deref())
        .await?
        .ok_or(ApiError::NotFound)?;
    let object = format!("{}:{}", commit_sha, path);
    let kind = run_git_command(
        &repo,
        &["cat-file".to_string(), "-t".to_string(), object.clone()],
    )
    .await?;
    if kind.trim() != "blob" {
        return Err(ApiError::NotFound);
    }
    let bytes = run_git_command_bytes(&repo, &["show".to_string(), object]).await?;
    let media_type = media_type_for_path(&path);

    Ok(Response::builder()
        .header("content-type", media_type)
        .body(Body::from(bytes))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()))
}

pub(crate) async fn list_commits_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<CommitListQuery>,
) -> ApiResult<Json<RepositoryCommitListResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-commit", &format!("{owner}/{name}"), 120, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let commits = list_commits(&repo, query.ref_name.as_deref(), query.limit.unwrap_or(50)).await?;
    Ok(Json(RepositoryCommitListResponse { data: commits }))
}

pub(crate) async fn get_commit_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, sha)): Path<(String, String, String)>,
) -> ApiResult<Json<RepositoryCommitDetailResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(
        &state,
        "repo-commit-detail",
        &format!("{owner}/{name}"),
        60,
        60,
    )
    .await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(commit_detail(&repo, &sha).await?))
}

pub(crate) async fn compare_upstream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryCompareResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-compare", &format!("{owner}/{name}"), 20, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(compare_repo_upstream(&state, &repo).await?))
}

pub(crate) async fn sync_upstream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryCompareResponse>> {
    let auth = require_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-sync", &auth.username, 10, 300).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    resolve_writable_namespace(&state.pool, &auth, &repo.owner_handle).await?;

    let (source, upstream_url, upstream_branch) =
        upstream_target(&state, &repo).await?.ok_or_else(|| {
            ApiError::BadRequest("repository is not a fork or upstream is unavailable".to_string())
        })?;
    let upstream_ref = fetch_upstream_ref(&repo, &upstream_url, &upstream_branch).await?;
    sync_from_upstream(&repo, &upstream_ref, &auth).await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;

    let repo = find_repo(&state.pool, &owner, &name).await?;
    let fork_ref = format!("refs/heads/{}", repo.default_branch);
    Ok(Json(
        compare_refs(&repo, source, &upstream_ref, &fork_ref).await?,
    ))
}

async fn compare_repo_upstream(
    state: &AppState,
    repo: &Repository,
) -> ApiResult<RepositoryCompareResponse> {
    let Some((source, upstream_url, upstream_branch)) = upstream_target(state, repo).await? else {
        return Ok(RepositoryCompareResponse {
            status: "unavailable".to_string(),
            source: repository_source_response(&state.pool, &state.config, repo).await?,
            ahead_by: 0,
            behind_by: 0,
            ahead_commits: Vec::new(),
            behind_commits: Vec::new(),
            files: Vec::new(),
            message: Some(
                "This repository is not a fork or its upstream could not be resolved.".to_string(),
            ),
        });
    };

    match fetch_upstream_ref(repo, &upstream_url, &upstream_branch).await {
        Ok(upstream_ref) => {
            let fork_ref = format!("refs/heads/{}", repo.default_branch);
            compare_refs(repo, source, &upstream_ref, &fork_ref).await
        }
        Err(error) => Ok(RepositoryCompareResponse {
            status: "unavailable".to_string(),
            source,
            ahead_by: 0,
            behind_by: 0,
            ahead_commits: Vec::new(),
            behind_commits: Vec::new(),
            files: Vec::new(),
            message: Some(error.to_string()),
        }),
    }
}

async fn upstream_target(
    state: &AppState,
    repo: &Repository,
) -> ApiResult<Option<(Option<RepositorySourceResponse>, String, String)>> {
    if let Some(source_id) = repo.source_repository_id {
        let source: Option<Repository> = sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
            .bind(source_id)
            .fetch_optional(&state.pool)
            .await?;
        if let Some(source) = source {
            let source_response = RepositorySourceResponse {
                owner_handle: source.owner_handle.clone(),
                name: source.name.clone(),
                url: repo_activity_url(&state.config, &source),
                kind: "local".to_string(),
            };
            return Ok(Some((
                Some(source_response),
                source.local_path,
                source.default_branch,
            )));
        }
    }

    if let Some(source_url) = repo.source_remote_url.as_ref() {
        let source_response = repository_source_response(&state.pool, &state.config, repo).await?;
        return Ok(Some((
            source_response,
            source_url.clone(),
            repo.default_branch.clone(),
        )));
    }

    Ok(None)
}

pub(crate) async fn update_repo_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoFileQuery>,
    Json(input): Json<UpdateRepoFileRequest>,
) -> ApiResult<Json<RepositoryFileResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    resolve_writable_namespace(&state.pool, &auth, &repo.owner_handle).await?;
    let path = normalize_repo_file_path(&query.path)?;
    commit_repo_file_change(
        &repo,
        &auth,
        &path,
        RepoFileChange::Write(input.content),
        input
            .message
            .unwrap_or_else(|| format!("Update {}", repo_path_name(&path))),
    )
    .await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    let file = repo_file_response(&repo, &path, None).await?;
    Ok(Json(file))
}

pub(crate) async fn delete_repo_path(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoFileQuery>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    resolve_writable_namespace(&state.pool, &auth, &repo.owner_handle).await?;
    let path = normalize_repo_file_path(&query.path)?;
    commit_repo_file_change(
        &repo,
        &auth,
        &path,
        RepoFileChange::Delete,
        query
            .message
            .map(|message| message.trim().to_string())
            .filter(|message| !message.is_empty())
            .unwrap_or_else(|| format!("Deleting {}", repo_path_name(&path))),
    )
    .await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, repo).await?,
    ))
}

pub(crate) async fn star_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:star")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    match auth {
        RepoActionAuth::Local(auth) => {
            sqlx::query(
                r#"
                INSERT INTO repository_stars (repository_id, user_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(repo.id)
            .bind(auth.id)
            .execute(&state.pool)
            .await?;
        }
        RepoActionAuth::Federated(auth) => {
            sqlx::query(
                r#"
                INSERT INTO repository_remote_stars
                  (repository_id, remote_actor, remote_server, display_name, avatar_url)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (repository_id, remote_actor)
                DO UPDATE SET
                  display_name = EXCLUDED.display_name,
                  avatar_url = EXCLUDED.avatar_url
                "#,
            )
            .bind(repo.id)
            .bind(auth.actor_url)
            .bind(auth.home_server)
            .bind(auth.display_name)
            .bind(auth.avatar_url)
            .execute(&state.pool)
            .await?;
        }
    }
    let repo = sync_repo_stars(&state.pool, repo.id).await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, repo).await?,
    ))
}

pub(crate) async fn unstar_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:star")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    match auth {
        RepoActionAuth::Local(auth) => {
            sqlx::query("DELETE FROM repository_stars WHERE repository_id = $1 AND user_id = $2")
                .bind(repo.id)
                .bind(auth.id)
                .execute(&state.pool)
                .await?;
        }
        RepoActionAuth::Federated(auth) => {
            sqlx::query(
                "DELETE FROM repository_remote_stars WHERE repository_id = $1 AND remote_actor = $2",
            )
            .bind(repo.id)
            .bind(auth.actor_url)
            .execute(&state.pool)
            .await?;
        }
    }
    let repo = sync_repo_stars(&state.pool, repo.id).await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, repo).await?,
    ))
}

pub(crate) async fn fork_repo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<ForkRepoRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_auth(&state, &headers)?;
    let source = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, Some(&auth), &source).await?;
    let fork_name = normalize_name(input.name.as_deref().unwrap_or(&source.name))?;
    let namespace = resolve_writable_namespace(&state.pool, &auth, &auth.username).await?;
    let local_path = repo_path(&state.config, &namespace.name, &fork_name);
    create_bare_repo(&local_path).await?;

    let repo = sqlx::query_as::<_, Repository>(
        r#"
        INSERT INTO repositories
          (id, namespace_id, owner_id, owner_handle, name, description, visibility, local_path,
           remote_url, remote_server, source_repository_id, source_remote_url)
        VALUES ($1, $2, $3, $4, $5, $6, 'public', $7, $8, $9, $10, $11)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(namespace.id)
    .bind(auth.id)
    .bind(&namespace.name)
    .bind(fork_name)
    .bind(format!("Fork of {}/{}", source.owner_handle, source.name))
    .bind(local_path.to_string_lossy().to_string())
    .bind(source.remote_url.clone())
    .bind(source.remote_server.clone())
    .bind(source.id)
    .bind(repo_activity_url(&state.config, &source))
    .fetch_one(&state.pool)
    .await?;

    if source.local_path.is_empty() {
        if let Some(remote_url) = source
            .source_remote_url
            .as_deref()
            .or(source.remote_url.as_deref())
        {
            try_initialize_fork_from_source(&repo, remote_url).await;
        }
    } else {
        initialize_fork_from_source(&repo, &source.local_path).await?;
    }

    let activity_id = format!(
        "{}/activities/{}",
        state.config.app_base_url,
        Uuid::now_v7()
    );
    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": "Create",
        "actor": state.config.actor_url(&auth.username),
        "object": {
            "type": "RepositoryFork",
            "source": repo_activity_url(&state.config, &source),
            "fork": repo_activity_url(&state.config, &repo),
            "name": repo.name,
            "server": state.config.host()
        }
    });
    record_activity(
        &state.pool,
        "outbound",
        source.remote_server.as_deref(),
        &activity,
        "queued",
    )
    .await?;

    if let Some(remote_url) = source.remote_url.as_deref() {
        deliver_activity(&state, remote_url, &activity).await;
    }

    invalidate_repo_cache(&state, &source.owner_handle, &source.name).await;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, repo).await?,
    ))
}

pub(crate) async fn create_pull_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<CreatePullRequestRequest>,
) -> ApiResult<Json<PullRequest>> {
    let auth = require_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, Some(&auth), &target).await?;
    if !target.pull_requests_enabled {
        return Err(ApiError::Forbidden(
            "pull requests are disabled for this repository".to_string(),
        ));
    }
    ensure_pull_request_allowed(&state, &auth, &target).await?;
    let source_repo_url = validate_remote_url(&input.source_repo_url)?.to_string();
    let activity_id = format!(
        "{}/activities/{}",
        state.config.app_base_url,
        Uuid::now_v7()
    );

    let pr = sqlx::query_as::<_, PullRequest>(
        r#"
        INSERT INTO pull_requests
          (id, target_repository_id, source_repository_id, title, body, author_handle,
           source_repo_url, source_branch, target_branch, status, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(target.id)
    .bind(input.source_repository_id)
    .bind(input.title)
    .bind(input.body.unwrap_or_default())
    .bind(local_handle(&auth.username, &state.config))
    .bind(source_repo_url)
    .bind(input.source_branch)
    .bind(
        input
            .target_branch
            .unwrap_or_else(|| target.default_branch.clone()),
    )
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;

    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": "Offer",
        "actor": state.config.actor_url(&auth.username),
        "object": {
            "type": "PullRequest",
            "id": format!("{}/pull-requests/{}", state.config.app_base_url, pr.id),
            "target": repo_activity_url(&state.config, &target),
            "source": pr.source_repo_url,
            "sourceBranch": pr.source_branch,
            "targetBranch": pr.target_branch,
            "title": pr.title,
            "body": pr.body
        }
    });
    record_activity(
        &state.pool,
        "outbound",
        target.remote_server.as_deref(),
        &activity,
        "queued",
    )
    .await?;

    if let Some(remote_url) = target.remote_url.as_deref() {
        deliver_activity(&state, remote_url, &activity).await;
    }

    invalidate_repo_cache(&state, &target.owner_handle, &target.name).await;
    Ok(Json(pr))
}

pub(crate) async fn list_pull_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = optional_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &target).await?;
    let prs = sqlx::query_as::<_, PullRequest>(
        "SELECT * FROM pull_requests WHERE target_repository_id = $1 ORDER BY created_at DESC",
    )
    .bind(target.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "data": prs })))
}

pub(crate) async fn list_issues(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<IssueListQuery>,
) -> ApiResult<Json<PaginatedResponse<Issue>>> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let status = normalize_issue_status_filter(query.status)?;
    let total = issue_count(&state, repo.id, status.as_deref()).await?;
    let issues = sqlx::query_as::<_, Issue>(
        r#"
        SELECT *
        FROM issues
        WHERE repository_id = $1 AND ($2::TEXT IS NULL OR status = $2)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(repo.id)
    .bind(status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(PaginatedResponse {
        data: issues,
        pagination: pagination(page, limit, total),
    }))
}

pub(crate) async fn create_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<CreateIssueRequest>,
) -> ApiResult<Json<Issue>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:issue")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    if !repo.issues_enabled {
        return Err(ApiError::Forbidden(
            "issues are disabled for this repository".to_string(),
        ));
    }
    let title = validate_issue_title(&input.title)?;
    let author = issue_author(&state, &auth).await?;
    let activity_id = format!(
        "{}/activities/{}",
        state.config.app_base_url.trim_end_matches('/'),
        Uuid::now_v7()
    );

    let issue = sqlx::query_as::<_, Issue>(
        r#"
        INSERT INTO issues
          (id, repository_id, number, title, body, author_handle, author_actor_url,
           author_display_name, author_avatar_url, remote_server, status, activity_id)
        SELECT $1, $2, COALESCE(MAX(number), 0) + 1, $3, $4, $5, $6, $7, $8, $9, 'open', $10
        FROM issues
        WHERE repository_id = $2
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repo.id)
    .bind(title)
    .bind(input.body.unwrap_or_default())
    .bind(author.handle)
    .bind(author.actor_url)
    .bind(author.display_name)
    .bind(author.avatar_url)
    .bind(author.remote_server)
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;

    deliver_issue_activity(&state, &repo, &issue, &activity_id, "Create").await?;
    Ok(Json(issue))
}

pub(crate) async fn get_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number)): Path<(String, String, i32)>,
) -> ApiResult<Json<Issue>> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(find_issue(&state, repo.id, number).await?))
}

pub(crate) async fn update_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number)): Path<(String, String, i32)>,
    Json(input): Json<UpdateIssueRequest>,
) -> ApiResult<Json<Issue>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:issue")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let current = find_issue(&state, repo.id, number).await?;
    ensure_issue_updatable(&state, &repo, &current, &auth).await?;
    let title = match input.title {
        Some(title) => Some(validate_issue_title(&title)?),
        None => None,
    };
    let status = match input.status {
        Some(status) => Some(normalize_issue_status(&status)?),
        None => None,
    };

    let issue = sqlx::query_as::<_, Issue>(
        r#"
        UPDATE issues
        SET title = COALESCE($3, title),
            body = COALESCE($4, body),
            status = COALESCE($5, status),
            updated_at = now()
        WHERE repository_id = $1 AND number = $2
        RETURNING *
        "#,
    )
    .bind(repo.id)
    .bind(number)
    .bind(title)
    .bind(input.body)
    .bind(status)
    .fetch_one(&state.pool)
    .await?;

    let activity_id = format!(
        "{}/activities/{}",
        state.config.app_base_url.trim_end_matches('/'),
        Uuid::now_v7()
    );
    deliver_issue_activity(&state, &repo, &issue, &activity_id, "Update").await?;
    Ok(Json(issue))
}

pub(crate) async fn list_issue_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number)): Path<(String, String, i32)>,
    Query(query): Query<IssueListQuery>,
) -> ApiResult<Json<PaginatedResponse<IssueComment>>> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM comments WHERE issue_id = $1")
        .bind(issue.id)
        .fetch_one(&state.pool)
        .await?;
    let comments = sqlx::query_as::<_, IssueComment>(
        r#"
        SELECT *
        FROM comments
        WHERE issue_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(issue.id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(PaginatedResponse {
        data: comments,
        pagination: pagination(page, limit, total.0),
    }))
}

pub(crate) async fn create_issue_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number)): Path<(String, String, i32)>,
    Json(input): Json<CreateIssueCommentRequest>,
) -> ApiResult<Json<IssueComment>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let body = validate_comment_body(&input.body)?;
    let author = issue_author(&state, &auth).await?;
    let activity_id = format!(
        "{}/activities/{}",
        state.config.app_base_url.trim_end_matches('/'),
        Uuid::now_v7()
    );

    let comment = sqlx::query_as::<_, IssueComment>(
        r#"
        INSERT INTO comments
          (id, repository_id, issue_id, author_handle, author_actor_url,
           author_display_name, author_avatar_url, remote_server, body, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repo.id)
    .bind(issue.id)
    .bind(author.handle)
    .bind(author.actor_url)
    .bind(author.display_name)
    .bind(author.avatar_url)
    .bind(author.remote_server)
    .bind(body)
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;

    deliver_issue_comment_activity(&state, &repo, &issue, &comment, &activity_id).await?;
    Ok(Json(comment))
}

struct IssueAuthor {
    handle: String,
    actor_url: Option<String>,
    display_name: String,
    avatar_url: Option<String>,
    remote_server: Option<String>,
}

async fn validate_default_branch(repo: &Repository, branch: &str) -> ApiResult<()> {
    let branches = list_branches(repo).await?;
    if branches.is_empty() || branches.iter().any(|item| item.name == branch) {
        return Ok(());
    }
    Err(ApiError::BadRequest(
        "default branch must exist in the repository".to_string(),
    ))
}

async fn move_repo_storage(current_path: &str, next_path: &PathBuf) -> ApiResult<()> {
    let current_path = PathBuf::from(current_path);
    if current_path == *next_path {
        return Ok(());
    }
    if fs::try_exists(next_path).await? {
        return Err(ApiError::Conflict(
            "repository storage path already exists".to_string(),
        ));
    }
    if let Some(parent) = next_path.parent() {
        fs::create_dir_all(parent).await?;
    }
    if fs::try_exists(&current_path).await? {
        fs::rename(current_path, next_path).await?;
    }
    Ok(())
}

async fn issue_author(state: &AppState, auth: &RepoActionAuth) -> ApiResult<IssueAuthor> {
    match auth {
        RepoActionAuth::Local(auth) => {
            let user = get_user_by_id(&state.pool, auth.id).await?;
            Ok(IssueAuthor {
                handle: local_handle(&user.username, &state.config),
                actor_url: Some(user.actor_url),
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                remote_server: None,
            })
        }
        RepoActionAuth::Federated(auth) => Ok(IssueAuthor {
            handle: format!(
                "{}@{}",
                auth.username,
                auth.home_server
                    .trim_start_matches("https://")
                    .trim_start_matches("http://")
            ),
            actor_url: Some(auth.actor_url.clone()),
            display_name: auth.display_name.clone(),
            avatar_url: auth.avatar_url.clone(),
            remote_server: Some(auth.home_server.clone()),
        }),
    }
}

fn pagination_input(page: Option<i64>, limit: Option<i64>) -> (i64, i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let limit = limit.unwrap_or(25).clamp(1, 100);
    let offset = (page - 1) * limit;
    (page, limit, offset)
}

fn pagination(page: i64, limit: i64, total: i64) -> Pagination {
    Pagination {
        page,
        limit,
        total,
        total_pages: if total == 0 {
            0
        } else {
            (total + limit - 1) / limit
        },
    }
}

async fn issue_count(
    state: &AppState,
    repository_id: Uuid,
    status: Option<&str>,
) -> ApiResult<i64> {
    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM issues WHERE repository_id = $1 AND ($2::TEXT IS NULL OR status = $2)",
    )
    .bind(repository_id)
    .bind(status)
    .fetch_one(&state.pool)
    .await?;
    Ok(total.0)
}

fn normalize_issue_status_filter(status: Option<String>) -> ApiResult<Option<String>> {
    match status
        .as_deref()
        .map(str::trim)
        .filter(|status| !status.is_empty())
    {
        Some("all") => Ok(None),
        Some(status) => Ok(Some(normalize_issue_status(status)?)),
        None => Ok(Some("open".to_string())),
    }
}

fn normalize_issue_status(status: &str) -> ApiResult<String> {
    match status.trim() {
        "open" => Ok("open".to_string()),
        "closed" => Ok("closed".to_string()),
        _ => Err(ApiError::BadRequest("invalid issue status".to_string())),
    }
}

fn normalize_repo_permission(permission: &str) -> ApiResult<String> {
    match permission.trim() {
        "read" | "write" | "admin" => Ok(permission.trim().to_string()),
        _ => Err(ApiError::BadRequest(
            "invalid collaborator permission".to_string(),
        )),
    }
}

fn validate_issue_title(title: &str) -> ApiResult<String> {
    let title = title.trim();
    if title.is_empty() {
        return Err(ApiError::BadRequest("issue title is required".to_string()));
    }
    Ok(title.to_string())
}

fn validate_comment_body(body: &str) -> ApiResult<String> {
    let body = body.trim();
    if body.is_empty() {
        return Err(ApiError::BadRequest("comment body is required".to_string()));
    }
    Ok(body.to_string())
}

async fn find_issue(state: &AppState, repository_id: Uuid, number: i32) -> ApiResult<Issue> {
    Ok(
        sqlx::query_as::<_, Issue>("SELECT * FROM issues WHERE repository_id = $1 AND number = $2")
            .bind(repository_id)
            .bind(number)
            .fetch_one(&state.pool)
            .await?,
    )
}

async fn ensure_issue_updatable(
    state: &AppState,
    repo: &Repository,
    issue: &Issue,
    auth: &RepoActionAuth,
) -> ApiResult<()> {
    match auth {
        RepoActionAuth::Local(auth) => {
            if resolve_writable_namespace(&state.pool, auth, &repo.owner_handle)
                .await
                .is_ok()
            {
                return Ok(());
            }
            let actor_url = state.config.actor_url(&auth.username);
            if issue.author_actor_url.as_deref() == Some(actor_url.as_str()) {
                return Ok(());
            }
        }
        RepoActionAuth::Federated(auth) => {
            if issue.author_actor_url.as_deref() == Some(auth.actor_url.as_str()) {
                return Ok(());
            }
        }
    }
    Err(ApiError::Unauthorized)
}

async fn ensure_pull_request_allowed(
    state: &AppState,
    auth: &AuthUser,
    repo: &Repository,
) -> ApiResult<()> {
    if repo.pull_request_policy != "collaborators" {
        return Ok(());
    }
    if resolve_writable_namespace(&state.pool, auth, &repo.owner_handle)
        .await
        .is_ok()
    {
        return Ok(());
    }
    let collaborator: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM repository_collaborators WHERE repository_id = $1 AND user_id = $2",
    )
    .bind(repo.id)
    .bind(auth.id)
    .fetch_optional(&state.pool)
    .await?;
    if collaborator.is_some() {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "only collaborators can open pull requests for this repository".to_string(),
        ))
    }
}

async fn deliver_issue_activity(
    state: &AppState,
    repo: &Repository,
    issue: &Issue,
    activity_id: &str,
    activity_type: &str,
) -> ApiResult<()> {
    let actor = issue
        .author_actor_url
        .as_deref()
        .unwrap_or(&issue.author_handle);
    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": activity_type,
        "actor": actor,
        "object": {
            "type": "Issue",
            "id": issue_activity_url(&state.config, repo, issue.number),
            "target": repo_activity_url(&state.config, repo),
            "number": issue.number,
            "title": issue.title,
            "body": issue.body,
            "status": issue.status,
            "attributedTo": actor,
            "name": issue.author_display_name,
            "icon": issue.author_avatar_url
        }
    });
    record_activity(
        &state.pool,
        "outbound",
        repo.remote_server.as_deref(),
        &activity,
        "queued",
    )
    .await?;
    if let Some(remote_url) = repo.remote_url.as_deref() {
        deliver_activity(state, remote_url, &activity).await;
    }
    Ok(())
}

async fn deliver_issue_comment_activity(
    state: &AppState,
    repo: &Repository,
    issue: &Issue,
    comment: &IssueComment,
    activity_id: &str,
) -> ApiResult<()> {
    let actor = comment
        .author_actor_url
        .as_deref()
        .unwrap_or(&comment.author_handle);
    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": "Create",
        "actor": actor,
        "object": {
            "type": "Note",
            "id": format!("{}/comments/{}", issue_activity_url(&state.config, repo, issue.number), comment.id),
            "target": issue_activity_url(&state.config, repo, issue.number),
            "content": comment.body,
            "attributedTo": actor,
            "name": comment.author_display_name,
            "icon": comment.author_avatar_url
        }
    });
    record_activity(
        &state.pool,
        "outbound",
        repo.remote_server.as_deref(),
        &activity,
        "queued",
    )
    .await?;
    if let Some(remote_url) = repo.remote_url.as_deref() {
        deliver_activity(state, remote_url, &activity).await;
    }
    Ok(())
}

pub(crate) fn issue_activity_url(
    config: &crate::config::Config,
    repo: &Repository,
    number: i32,
) -> String {
    format!(
        "{}/{}/{}/issues/{}",
        config.app_base_url.trim_end_matches('/'),
        repo.owner_handle,
        repo.name,
        number
    )
}
