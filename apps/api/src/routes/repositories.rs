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

    ensure_repo_head(&updated).await?;
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

pub(crate) async fn list_repos(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = optional_auth(&state, &headers)?;
    let auth_cache_key = auth
        .as_ref()
        .map(|auth| auth.id.to_string())
        .unwrap_or_else(|| "public".to_string());
    let cache_key = cache_key(&["repos", "list", &auth_cache_key]);
    if let Some(cached) = state.cache.get_json::<Value>(&cache_key).await {
        return Ok(Json(cached));
    }

    let repos = public_repositories(&state.pool).await?;
    let mut responses = Vec::with_capacity(repos.len());
    for repo in repos {
        responses.push(
            repository_response_for_auth(&state.pool, &state.config, repo, auth.as_ref()).await?,
        );
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
    let response =
        repository_response_for_auth(&state.pool, &state.config, repo, auth.as_ref()).await?;
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
    let path = query
        .path
        .as_deref()
        .map(normalize_repo_file_path)
        .transpose()?;
    let treeish = path
        .as_ref()
        .map(|path| format!("{commit_sha}:{path}"))
        .unwrap_or_else(|| commit_sha.clone());
    let tree_args = if query.recursive.unwrap_or(false) {
        vec![
            "ls-tree".to_string(),
            "-l".to_string(),
            "-r".to_string(),
            "-t".to_string(),
            treeish,
        ]
    } else {
        vec!["ls-tree".to_string(), "-l".to_string(), treeish]
    };
    let tree = run_git_command(&repo, &tree_args).await?;
    let mut entries = Vec::new();

    for line in tree.lines() {
        if let Some((entry_name, kind, size)) = parse_ls_tree_line(line) {
            let entry_path = path
                .as_ref()
                .map(|base| format!("{base}/{entry_name}"))
                .unwrap_or_else(|| entry_name.clone());
            let name = entry_name
                .rsplit_once('/')
                .map(|(_, name)| name.to_string())
                .unwrap_or(entry_name);
            let last_commit = git_last_commit(&repo, &commit_sha, Some(&entry_path)).await?;
            entries.push(RepositoryTreeEntryResponse {
                extension: file_extension(&name),
                name,
                path: entry_path,
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

pub(crate) async fn list_repo_tags(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryTagListResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-tags", &format!("{owner}/{name}"), 120, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let output = run_git_command(
        &repo,
        &[
            "for-each-ref".to_string(),
            "--format=%(refname:short)%00%(objectname)".to_string(),
            "refs/tags".to_string(),
        ],
    )
    .await?;
    let data = output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\0');
            let name = parts.next()?.trim();
            let sha = parts.next()?.trim();
            if name.is_empty() {
                return None;
            }
            Some(RepositoryTagResponse {
                name: name.to_string(),
                commit_sha: if sha.is_empty() {
                    None
                } else {
                    Some(sha.to_string())
                },
            })
        })
        .collect();
    Ok(Json(RepositoryTagListResponse { data }))
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

pub(crate) async fn get_repo_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoRefQuery>,
) -> ApiResult<Json<RepositoryStatsResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-stats", &format!("{owner}/{name}"), 60, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(
        repository_stats(&state, &repo, query.ref_name.as_deref()).await?,
    ))
}

pub(crate) async fn list_repo_languages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoRefQuery>,
) -> ApiResult<Json<RepositoryLanguageListResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(&state, "repo-languages", &format!("{owner}/{name}"), 60, 60).await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(
        repository_languages(&state, &repo, query.ref_name.as_deref()).await?,
    ))
}

pub(crate) async fn list_repo_contributors(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoRefQuery>,
) -> ApiResult<Json<RepositoryContributorListResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(
        &state,
        "repo-contributors",
        &format!("{owner}/{name}"),
        60,
        60,
    )
    .await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(
        repository_contributors(&state.pool, &repo, query.ref_name.as_deref()).await?,
    ))
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
    let mut commits =
        list_commits(&repo, query.ref_name.as_deref(), query.limit.unwrap_or(50)).await?;
    attach_commit_account_authors(&state.pool, &repo, &mut commits).await?;
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
    let mut detail = commit_detail(&repo, &sha).await?;
    attach_commit_account_authors(&state.pool, &repo, std::slice::from_mut(&mut detail.commit))
        .await?;
    Ok(Json(detail))
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
    let commit_sha = commit_repo_file_change(
        &repo,
        &auth,
        &path,
        RepoFileChange::Write(input.content),
        input
            .message
            .unwrap_or_else(|| format!("Update {}", repo_path_name(&path))),
    )
    .await?;
    record_commit_author(&state, &repo, &auth, &commit_sha).await?;
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
    let commit_sha = commit_repo_file_change(
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
    record_commit_author(&state, &repo, &auth, &commit_sha).await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response_for_auth(&state.pool, &state.config, repo, Some(&auth)).await?,
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
    match &auth {
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
            .bind(&auth.actor_url)
            .bind(&auth.home_server)
            .bind(&auth.display_name)
            .bind(&auth.avatar_url)
            .execute(&state.pool)
            .await?;
        }
    }
    let repo = sync_repo_stars(&state.pool, repo.id).await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    let local_auth = match &auth {
        RepoActionAuth::Local(auth) => Some(auth),
        RepoActionAuth::Federated(_) => None,
    };
    Ok(Json(
        repository_response_for_auth(&state.pool, &state.config, repo, local_auth).await?,
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
    match &auth {
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
            .bind(&auth.actor_url)
            .execute(&state.pool)
            .await?;
        }
    }
    let repo = sync_repo_stars(&state.pool, repo.id).await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    let local_auth = match &auth {
        RepoActionAuth::Local(auth) => Some(auth),
        RepoActionAuth::Federated(_) => None,
    };
    Ok(Json(
        repository_response_for_auth(&state.pool, &state.config, repo, local_auth).await?,
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
    let requested_name = input.name.is_some();
    let fork_name = normalize_name(input.name.as_deref().unwrap_or(&source.name))?;
    let namespace = resolve_writable_namespace(&state.pool, &auth, &auth.username).await?;
    let existing = sqlx::query_as::<_, Repository>(
        "SELECT * FROM repositories WHERE owner_handle = $1 AND name = $2",
    )
    .bind(&namespace.name)
    .bind(&fork_name)
    .fetch_optional(&state.pool)
    .await?;
    if let Some(existing) = existing {
        if !requested_name && existing.source_repository_id == Some(source.id) {
            return Ok(Json(
                repository_response(&state.pool, &state.config, existing).await?,
            ));
        }

        return Err(ApiError::Conflict(format!(
            "repository {}/{} already exists",
            namespace.name, fork_name
        )));
    }

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
    .bind(&fork_name)
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
) -> ApiResult<Json<PullRequestResponse>> {
    let auth = require_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, Some(&auth), &target).await?;
    if !target.pull_requests_enabled {
        return Err(ApiError::Forbidden(
            "pull requests are disabled for this repository".to_string(),
        ));
    }
    ensure_pull_request_allowed(&state, &auth, &target).await?;
    ensure_pull_request_source_visible(&state, Some(&auth), input.source_repository_id).await?;
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
    Ok(Json(
        pull_request_response(&state, &target, pr, Some(&auth)).await?,
    ))
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
    let mut data = Vec::with_capacity(prs.len());
    for pr in prs {
        data.push(pull_request_response(&state, &target, pr, auth.as_ref()).await?);
    }
    Ok(Json(json!({ "data": data })))
}

pub(crate) async fn pull_request_options(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<PullRequestOptionsResponse>> {
    let auth = optional_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &target).await?;

    let forks = sqlx::query_as::<_, Repository>(
        "SELECT * FROM repositories WHERE source_repository_id = $1 ORDER BY updated_at DESC",
    )
    .bind(target.id)
    .fetch_all(&state.pool)
    .await?;
    let mut fork_options = Vec::new();
    for fork in forks {
        if ensure_repo_visible(&state.pool, auth.as_ref(), &fork)
            .await
            .is_ok()
        {
            fork_options.push(pull_request_source_option(&state.config, &fork, "fork").await?);
        }
    }

    Ok(Json(PullRequestOptionsResponse {
        repository: pull_request_source_option(&state.config, &target, "repository").await?,
        forks: fork_options,
        upstream: pull_request_upstream_option(&state, &target).await?,
    }))
}

pub(crate) async fn compare_pull_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<ComparePullRequestRequest>,
) -> ApiResult<Json<RepositoryCompareResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(
        &state,
        "repo-pr-compare",
        &format!("{owner}/{name}"),
        20,
        60,
    )
    .await?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &target).await?;

    let source_url = pull_request_input_git_source(
        &state,
        auth.as_ref(),
        input.source_repository_id,
        &input.source_repo_url,
    )
    .await?;
    let source_ref =
        fetch_pull_request_ref(&target, &source_url, &input.source_branch, Uuid::now_v7()).await?;
    let target_ref = format!(
        "refs/heads/{}",
        input
            .target_branch
            .filter(|branch| !branch.trim().is_empty())
            .unwrap_or_else(|| target.default_branch.clone())
    );

    Ok(Json(
        compare_refs(&target, None, &target_ref, &source_ref).await?,
    ))
}

pub(crate) async fn get_pull_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<PullRequestResponse>> {
    let auth = optional_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &target).await?;
    let pr = find_pull_request(&state, target.id, id).await?;
    Ok(Json(
        pull_request_response(&state, &target, pr, auth.as_ref()).await?,
    ))
}

pub(crate) async fn update_pull_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, Uuid)>,
    Json(input): Json<UpdatePullRequestRequest>,
) -> ApiResult<Json<PullRequestResponse>> {
    let auth = require_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, Some(&auth), &target).await?;
    ensure_repo_writer(&state, &auth, &target).await?;
    let current = find_pull_request(&state, target.id, id).await?;
    if current.status == "merged" {
        return Err(ApiError::BadRequest(
            "merged pull requests cannot be reopened or closed".to_string(),
        ));
    }
    let status = normalize_pull_request_status(input.status.as_deref())?;
    let pr = sqlx::query_as::<_, PullRequest>(
        r#"
        UPDATE pull_requests
        SET status = $3, updated_at = now()
        WHERE id = $1 AND target_repository_id = $2
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(target.id)
    .bind(status)
    .fetch_one(&state.pool)
    .await?;

    invalidate_repo_cache(&state, &target.owner_handle, &target.name).await;
    Ok(Json(
        pull_request_response(&state, &target, pr, Some(&auth)).await?,
    ))
}

pub(crate) async fn merge_pull_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, Uuid)>,
) -> ApiResult<Json<PullRequestResponse>> {
    let auth = require_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, Some(&auth), &target).await?;
    ensure_repo_writer(&state, &auth, &target).await?;
    let current = find_pull_request(&state, target.id, id).await?;
    if current.status != "open" {
        return Err(ApiError::BadRequest(
            "only open pull requests can be merged".to_string(),
        ));
    }

    let source_url = pull_request_git_source(&state, &current, Some(&auth)).await?;
    let source_ref =
        fetch_pull_request_ref(&target, &source_url, &current.source_branch, current.id).await?;
    merge_ref_into_branch(&target, &current.target_branch, &source_ref, &auth).await?;

    let pr = sqlx::query_as::<_, PullRequest>(
        r#"
        UPDATE pull_requests
        SET status = 'merged', updated_at = now()
        WHERE id = $1 AND target_repository_id = $2
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(target.id)
    .fetch_one(&state.pool)
    .await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(target.id)
        .execute(&state.pool)
        .await?;

    invalidate_repo_cache(&state, &target.owner_handle, &target.name).await;
    Ok(Json(
        pull_request_response(&state, &target, pr, Some(&auth)).await?,
    ))
}

pub(crate) async fn list_issue_labels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    Ok(Json(
        json!({ "data": issue_labels(&state, repo.id).await? }),
    ))
}

pub(crate) async fn upsert_issue_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<UpsertIssueLabelRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let label = upsert_issue_label_row(
        &state,
        repo.id,
        &normalize_issue_label_name(&input.name)?,
        input.color.as_deref().unwrap_or("#59636e"),
    )
    .await?;
    Ok(Json(label))
}

pub(crate) async fn delete_issue_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, label)): Path<(String, String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_admin(&state.pool, &auth, &repo).await?;
    let result = sqlx::query(
        "DELETE FROM issue_labels WHERE repository_id = $1 AND lower(name) = lower($2)",
    )
    .bind(repo.id)
    .bind(normalize_issue_label_name(&label)?)
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({ "status": "deleted" })))
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
    let labels = issue_label_filter(query.labels.as_deref())?;
    let search = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value));
    let total = issue_count(
        &state,
        repo.id,
        status.as_deref(),
        search.as_deref(),
        &labels,
    )
    .await?;
    let issues = sqlx::query_as::<_, Issue>(
        r#"
        SELECT issues.*,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', issue_labels.id, 'name', issue_labels.name, 'color', issue_labels.color) ORDER BY issue_labels.name)
            FROM issue_label_assignments
            JOIN issue_labels ON issue_labels.id = issue_label_assignments.label_id
            WHERE issue_label_assignments.issue_id = issues.id
          ), '[]'::jsonb) AS labels
        FROM issues
        WHERE repository_id = $1
          AND ($2::TEXT IS NULL OR status = $2)
          AND ($3::TEXT IS NULL OR title ILIKE $3 OR body ILIKE $3)
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($4::TEXT[]) AS requested_label(name)
            WHERE NOT EXISTS (
              SELECT 1
              FROM issue_label_assignments
              JOIN issue_labels ON issue_labels.id = issue_label_assignments.label_id
              WHERE issue_label_assignments.issue_id = issues.id
                AND lower(issue_labels.name) = lower(requested_label.name)
            )
          )
        ORDER BY created_at DESC
        LIMIT $5 OFFSET $6
        "#,
    )
    .bind(repo.id)
    .bind(status)
    .bind(search)
    .bind(labels)
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

    let issue_id: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO issues
          (id, repository_id, number, title, body, author_handle, author_actor_url,
           author_display_name, author_avatar_url, remote_server, status, activity_id)
        SELECT $1, $2, COALESCE(MAX(number), 0) + 1, $3, $4, $5, $6, $7, $8, $9, 'open', $10
        FROM issues
        WHERE repository_id = $2
        RETURNING id
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

    if let Some(labels) = input.labels {
        replace_issue_labels(&state, repo.id, issue_id.0, &labels).await?;
    }
    let issue = find_issue_by_id(&state, issue_id.0).await?;
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

    let issue_id: (Uuid,) = sqlx::query_as(
        r#"
        UPDATE issues
        SET title = COALESCE($3, title),
            body = COALESCE($4, body),
            status = COALESCE($5, status),
            updated_at = now()
        WHERE repository_id = $1 AND number = $2
        RETURNING id
        "#,
    )
    .bind(repo.id)
    .bind(number)
    .bind(title)
    .bind(input.body)
    .bind(status)
    .fetch_one(&state.pool)
    .await?;

    if let Some(labels) = input.labels {
        replace_issue_labels(&state, repo.id, issue_id.0, &labels).await?;
    }
    let issue = find_issue_by_id(&state, issue_id.0).await?;
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
    search: Option<&str>,
    labels: &[String],
) -> ApiResult<i64> {
    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM issues
        WHERE repository_id = $1
          AND ($2::TEXT IS NULL OR status = $2)
          AND ($3::TEXT IS NULL OR title ILIKE $3 OR body ILIKE $3)
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($4::TEXT[]) AS requested_label(name)
            WHERE NOT EXISTS (
              SELECT 1
              FROM issue_label_assignments
              JOIN issue_labels ON issue_labels.id = issue_label_assignments.label_id
              WHERE issue_label_assignments.issue_id = issues.id
                AND lower(issue_labels.name) = lower(requested_label.name)
            )
          )
        "#,
    )
    .bind(repository_id)
    .bind(status)
    .bind(search)
    .bind(labels)
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
    Ok(sqlx::query_as::<_, Issue>(
        r#"
        SELECT issues.*,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', issue_labels.id, 'name', issue_labels.name, 'color', issue_labels.color) ORDER BY issue_labels.name)
            FROM issue_label_assignments
            JOIN issue_labels ON issue_labels.id = issue_label_assignments.label_id
            WHERE issue_label_assignments.issue_id = issues.id
          ), '[]'::jsonb) AS labels
        FROM issues
        WHERE repository_id = $1 AND number = $2
        "#,
    )
    .bind(repository_id)
    .bind(number)
    .fetch_one(&state.pool)
    .await?)
}

async fn find_issue_by_id(state: &AppState, issue_id: Uuid) -> ApiResult<Issue> {
    Ok(sqlx::query_as::<_, Issue>(
        r#"
        SELECT issues.*,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', issue_labels.id, 'name', issue_labels.name, 'color', issue_labels.color) ORDER BY issue_labels.name)
            FROM issue_label_assignments
            JOIN issue_labels ON issue_labels.id = issue_label_assignments.label_id
            WHERE issue_label_assignments.issue_id = issues.id
          ), '[]'::jsonb) AS labels
        FROM issues
        WHERE id = $1
        "#,
    )
    .bind(issue_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn issue_labels(state: &AppState, repository_id: Uuid) -> ApiResult<Vec<Value>> {
    Ok(sqlx::query(
        "SELECT id, name, color FROM issue_labels WHERE repository_id = $1 ORDER BY name ASC",
    )
    .bind(repository_id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        json!({
            "id": row.get::<Uuid, _>("id"),
            "name": row.get::<String, _>("name"),
            "color": row.get::<String, _>("color"),
        })
    })
    .collect())
}

async fn upsert_issue_label_row(
    state: &AppState,
    repository_id: Uuid,
    name: &str,
    color: &str,
) -> ApiResult<Value> {
    let row = sqlx::query(
        r#"
        INSERT INTO issue_labels (id, repository_id, name, color)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (repository_id, lower(name)) DO UPDATE
        SET name = EXCLUDED.name, color = EXCLUDED.color
        RETURNING id, name, color
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repository_id)
    .bind(name)
    .bind(normalize_issue_label_color(color))
    .fetch_one(&state.pool)
    .await?;
    Ok(json!({
        "id": row.get::<Uuid, _>("id"),
        "name": row.get::<String, _>("name"),
        "color": row.get::<String, _>("color"),
    }))
}

async fn replace_issue_labels(
    state: &AppState,
    repository_id: Uuid,
    issue_id: Uuid,
    labels: &[String],
) -> ApiResult<()> {
    sqlx::query("DELETE FROM issue_label_assignments WHERE issue_id = $1")
        .bind(issue_id)
        .execute(&state.pool)
        .await?;
    for label in labels {
        let name = normalize_issue_label_name(label)?;
        let row = sqlx::query(
            r#"
            INSERT INTO issue_labels (id, repository_id, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (repository_id, lower(name)) DO UPDATE
            SET name = EXCLUDED.name
            RETURNING id
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(repository_id)
        .bind(name)
        .fetch_one(&state.pool)
        .await?;
        sqlx::query(
            "INSERT INTO issue_label_assignments (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(issue_id)
        .bind(row.get::<Uuid, _>("id"))
        .execute(&state.pool)
        .await?;
    }
    Ok(())
}

fn issue_label_filter(value: Option<&str>) -> ApiResult<Vec<String>> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map(normalize_issue_label_name)
        .collect()
}

fn normalize_issue_label_name(value: &str) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 40 {
        return Err(ApiError::BadRequest("invalid issue label".to_string()));
    }
    Ok(value.to_string())
}

fn normalize_issue_label_color(value: &str) -> String {
    let value = value.trim();
    if value.len() == 7
        && value.starts_with('#')
        && value.chars().skip(1).all(|char| char.is_ascii_hexdigit())
    {
        value.to_string()
    } else {
        "#59636e".to_string()
    }
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

async fn find_pull_request(
    state: &AppState,
    target_repository_id: Uuid,
    id: Uuid,
) -> ApiResult<PullRequest> {
    Ok(sqlx::query_as::<_, PullRequest>(
        "SELECT * FROM pull_requests WHERE target_repository_id = $1 AND id = $2",
    )
    .bind(target_repository_id)
    .bind(id)
    .fetch_one(&state.pool)
    .await?)
}

async fn pull_request_response(
    state: &AppState,
    target: &Repository,
    pr: PullRequest,
    auth: Option<&AuthUser>,
) -> ApiResult<PullRequestResponse> {
    let viewer_can_update = match auth {
        Some(auth) => can_update_pull_request(state, auth, target).await?,
        None => false,
    };

    Ok(PullRequestResponse {
        id: pr.id,
        target_repository_id: pr.target_repository_id,
        source_repository_id: pr.source_repository_id,
        title: pr.title,
        body: pr.body,
        author_handle: pr.author_handle,
        source_repo_url: pr.source_repo_url,
        source_branch: pr.source_branch,
        target_branch: pr.target_branch,
        status: pr.status,
        activity_id: pr.activity_id,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        viewer_can_update,
    })
}

async fn pull_request_source_option(
    config: &crate::config::Config,
    repo: &Repository,
    kind: &str,
) -> ApiResult<PullRequestSourceOptionResponse> {
    Ok(PullRequestSourceOptionResponse {
        repository_id: Some(repo.id),
        owner_handle: repo.owner_handle.clone(),
        name: repo.name.clone(),
        url: repository_git_url(config, repo),
        kind: kind.to_string(),
        branches: list_branches(repo).await?,
    })
}

async fn pull_request_upstream_option(
    state: &AppState,
    repo: &Repository,
) -> ApiResult<Option<PullRequestSourceOptionResponse>> {
    if let Some(source_id) = repo.source_repository_id {
        let source: Option<Repository> = sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
            .bind(source_id)
            .fetch_optional(&state.pool)
            .await?;
        if let Some(source) = source {
            return Ok(Some(
                pull_request_source_option(&state.config, &source, "upstream").await?,
            ));
        }
    }

    let Some(source) = repository_source_response(&state.pool, &state.config, repo).await? else {
        return Ok(None);
    };
    Ok(Some(PullRequestSourceOptionResponse {
        repository_id: None,
        owner_handle: source.owner_handle,
        name: source.name,
        url: source.url,
        kind: "upstream".to_string(),
        branches: Vec::new(),
    }))
}

fn repository_git_url(config: &crate::config::Config, repo: &Repository) -> String {
    format!(
        "{}/{}/{}.git",
        config.public_web_url.trim_end_matches('/'),
        repo.owner_handle,
        repo.name
    )
}

async fn pull_request_git_source(
    state: &AppState,
    pr: &PullRequest,
    auth: Option<&AuthUser>,
) -> ApiResult<String> {
    pull_request_input_git_source(state, auth, pr.source_repository_id, &pr.source_repo_url).await
}

async fn pull_request_input_git_source(
    state: &AppState,
    auth: Option<&AuthUser>,
    source_repository_id: Option<Uuid>,
    source_repo_url: &str,
) -> ApiResult<String> {
    if let Some(source_id) = source_repository_id {
        let source: Repository = sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
            .bind(source_id)
            .fetch_one(&state.pool)
            .await?;
        ensure_repo_visible(&state.pool, auth, &source).await?;
        return Ok(source.local_path);
    }

    Ok(validate_remote_url(source_repo_url)?.to_string())
}

async fn ensure_pull_request_source_visible(
    state: &AppState,
    auth: Option<&AuthUser>,
    source_repository_id: Option<Uuid>,
) -> ApiResult<()> {
    if let Some(source_id) = source_repository_id {
        let source: Repository = sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
            .bind(source_id)
            .fetch_one(&state.pool)
            .await?;
        ensure_repo_visible(&state.pool, auth, &source).await?;
    }
    Ok(())
}

fn normalize_pull_request_status(status: Option<&str>) -> ApiResult<String> {
    match status.map(str::trim) {
        Some("open") => Ok("open".to_string()),
        Some("closed") => Ok("closed".to_string()),
        _ => Err(ApiError::BadRequest(
            "invalid pull request status".to_string(),
        )),
    }
}

async fn can_update_pull_request(
    state: &AppState,
    auth: &AuthUser,
    repo: &Repository,
) -> ApiResult<bool> {
    if resolve_writable_namespace(&state.pool, auth, &repo.owner_handle)
        .await
        .is_ok()
    {
        return Ok(true);
    }

    let permission: Option<(String,)> = sqlx::query_as(
        "SELECT permission FROM repository_collaborators WHERE repository_id = $1 AND user_id = $2",
    )
    .bind(repo.id)
    .bind(auth.id)
    .fetch_optional(&state.pool)
    .await?;
    Ok(matches!(
        permission.as_ref().map(|value| value.0.as_str()),
        Some("write" | "admin")
    ))
}

async fn ensure_repo_writer(state: &AppState, auth: &AuthUser, repo: &Repository) -> ApiResult<()> {
    if can_update_pull_request(state, auth, repo).await? {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "repository write permission is required".to_string(),
        ))
    }
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
