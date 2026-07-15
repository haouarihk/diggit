use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{
        HeaderMap, StatusCode,
        header::{CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use pulldown_cmark::{Options as MarkdownOptions, Parser as MarkdownParser, html};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::BTreeSet;
use std::path::{Path as FsPath, PathBuf};
use tokio::fs;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

const FIXED_COMMENT_REACTIONS: [&str; 72] = [
    "👍", "👎", "👌", "👏", "🙌", "🙏", "🤝", "💪", "👀", "🧠", "💅", "😄", "😁", "😂", "🤣", "😊",
    "😍", "🥰", "😎", "🤔", "😕", "😢", "😭", "😡", "🤯", "😱", "🥳", "🎉", "✨", "🔥", "💯", "✅",
    "❌", "⚠️", "🚀", "🐛", "🛠️", "📌", "📎", "📝", "📚", "🔍", "💡", "💬", "❤️", "🧡", "💛", "💚",
    "💙", "💜", "🖤", "🤍", "⭐", "🌟", "🏆", "🍕", "☕", "🍻", "🌈", "🎯", "⏳", "⌛", "🔒", "🔓",
    "📦", "🧪", "🧹", "🔧", "🎨", "⚡", "🌍", "📣",
];
const MAX_COMMENT_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
const MAX_RELEASE_ASSET_BYTES: usize = 100 * 1024 * 1024;

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
    create_bare_repo(state.config.as_ref(), &namespace.name, &name, &local_path).await?;

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

pub(crate) async fn record_direct_repo_update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let token = headers
        .get("x-diggit-internal-token")
        .and_then(|value| value.to_str().ok());
    if token != Some(state.config.jwt_secret.as_str()) {
        return Err(ApiError::Unauthorized);
    }
    let repo = find_repo(&state.pool, &owner, &name).await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
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

    ensure_repo_head(&updated, state.config.as_ref()).await?;
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
    enforce_rate_limit(&state, "repo-detail", &format!("{owner}/{name}"), 240, 60).await?;
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
    let recursive = query.recursive.unwrap_or(false);
    let include_last_commit = query.include_last_commit.unwrap_or(true);
    let recursive_key = if recursive { "recursive" } else { "direct" };
    let last_commit_key = if include_last_commit {
        "with-commits"
    } else {
        "no-commits"
    };
    let path_key = repo_cache_path_key(path.as_deref());
    let cache_key = cache_key(&[
        "repo",
        &repo.owner_handle,
        &repo.name,
        "tree",
        &commit_sha,
        &ref_name,
        &path_key,
        recursive_key,
        last_commit_key,
    ]);
    if let Some(cached) = state
        .cache
        .get_json::<RepositoryTreeResponse>(&cache_key)
        .await
    {
        return Ok(Json(cached));
    }
    let treeish = path
        .as_ref()
        .map(|path| format!("{commit_sha}:{path}"))
        .unwrap_or_else(|| commit_sha.clone());
    let tree_args = if recursive {
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
            let last_commit = if include_last_commit {
                git_last_commit(&repo, &commit_sha, Some(&entry_path)).await?
            } else {
                None
            };
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
        last_commit: if include_last_commit {
            git_last_commit(&repo, &commit_sha, None).await?
        } else {
            None
        },
        entries,
    };
    state.cache.set_json(&cache_key, &response).await;
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

pub(crate) async fn list_releases(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<ReleaseListQuery>,
) -> ApiResult<Json<PaginatedResponse<ReleaseResponse>>> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let can_manage = release_viewer_can_manage(&state, auth.as_ref(), &repo).await?;
    let status = normalize_release_status_filter(query.status.as_deref())?;
    let search = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value));
    let tag = query
        .tag
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(validate_release_tag_name)
        .transpose()?;
    let prerelease = query.prerelease.unwrap_or(false);
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM releases
        WHERE repository_id = $1
          AND ($2::TEXT IS NULL OR status = $2)
          AND ($3 OR status = 'published')
          AND ($4::TEXT IS NULL OR tag_name = $4)
          AND (NOT $5 OR is_prerelease = TRUE)
          AND ($6::TEXT IS NULL OR title ILIKE $6 OR body ILIKE $6)
        "#,
    )
    .bind(repo.id)
    .bind(&status)
    .bind(can_manage)
    .bind(&tag)
    .bind(prerelease)
    .bind(&search)
    .fetch_one(&state.pool)
    .await?;
    let releases = sqlx::query_as::<_, Release>(
        r#"
        SELECT *
        FROM releases
        WHERE repository_id = $1
          AND ($2::TEXT IS NULL OR status = $2)
          AND ($3 OR status = 'published')
          AND ($4::TEXT IS NULL OR tag_name = $4)
          AND (NOT $5 OR is_prerelease = TRUE)
          AND ($6::TEXT IS NULL OR title ILIKE $6 OR body ILIKE $6)
        ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
        LIMIT $7 OFFSET $8
        "#,
    )
    .bind(repo.id)
    .bind(&status)
    .bind(can_manage)
    .bind(&tag)
    .bind(prerelease)
    .bind(&search)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;
    let mut data = Vec::with_capacity(releases.len());
    for release in releases {
        data.push(release_response(&state, &repo, release, auth.as_ref()).await?);
    }
    Ok(Json(PaginatedResponse {
        data,
        pagination: pagination(page, limit, total.0),
    }))
}

pub(crate) async fn get_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag)): Path<(String, String, String)>,
) -> ApiResult<Json<ReleaseResponse>> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let release = find_release_by_tag(&state, repo.id, &tag).await?;
    if release.status != "published"
        && !release_viewer_can_manage(&state, auth.as_ref(), &repo).await?
    {
        return Err(ApiError::NotFound);
    }
    Ok(Json(
        release_response(&state, &repo, release, auth.as_ref()).await?,
    ))
}

pub(crate) async fn create_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<CreateReleaseRequest>,
) -> ApiResult<Json<ReleaseResponse>> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    let auth = require_release_write_auth(&state, &headers, &repo).await?;
    let actor = release_actor(&state, &auth);
    let tag_name = validate_release_tag_name(&input.tag_name)?;
    let existing: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM releases WHERE repository_id = $1 AND tag_name = $2")
            .bind(repo.id)
            .bind(&tag_name)
            .fetch_optional(&state.pool)
            .await?;
    if existing.is_some() {
        return Err(ApiError::Conflict(
            "release already exists for this tag".to_string(),
        ));
    }
    let target_commit_sha =
        resolve_or_create_release_tag(&repo, &tag_name, input.target_ref.as_deref()).await?;
    let title = input
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&tag_name)
        .to_string();
    let body =
        release_body_from_input(&state, &repo, &tag_name, input.body, input.generate_notes).await?;
    let status = normalize_release_status(input.status.as_deref())?.unwrap_or("draft");
    let activity_id = if status == "published" {
        Some(new_activity_id(&state))
    } else {
        None
    };
    let release = sqlx::query_as::<_, Release>(
        r#"
        INSERT INTO releases
          (id, repository_id, tag_name, target_commit_sha, title, body, body_html,
           author_actor_url, author_handle, author_display_name, status, is_prerelease,
           activity_id, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                CASE WHEN $11 = 'published' THEN now() ELSE NULL END)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repo.id)
    .bind(&tag_name)
    .bind(target_commit_sha)
    .bind(title)
    .bind(&body)
    .bind(sanitize_markdown_html(&body))
    .bind(actor.actor_url)
    .bind(actor.handle)
    .bind(actor.display_name)
    .bind(status)
    .bind(input.is_prerelease.unwrap_or(false))
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;

    if release.status == "published" {
        deliver_release_activity(&state, &repo, &release, "Create").await?;
    }
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        release_response(&state, &repo, release, local_auth_from_release_write(&auth)).await?,
    ))
}

pub(crate) async fn update_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag)): Path<(String, String, String)>,
    Json(input): Json<UpdateReleaseRequest>,
) -> ApiResult<Json<ReleaseResponse>> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    let auth = require_release_write_auth(&state, &headers, &repo).await?;
    let current = find_release_by_tag(&state, repo.id, &tag).await?;
    let body_was_provided = input.body.is_some();
    let body = release_body_from_input(
        &state,
        &repo,
        &current.tag_name,
        input.body,
        input.generate_notes,
    )
    .await?
    .trim_end()
    .to_string();
    let next_body = if !body_was_provided && input.generate_notes != Some(true) {
        current.body.clone()
    } else {
        body
    };
    let status = normalize_release_status(input.status.as_deref())?
        .unwrap_or(current.status.as_str())
        .to_string();
    let activity_id = if status == "published" {
        current
            .activity_id
            .clone()
            .or_else(|| Some(new_activity_id(&state)))
    } else {
        None
    };
    let release = sqlx::query_as::<_, Release>(
        r#"
        UPDATE releases
        SET title = $3,
            body = $4,
            body_html = $5,
            status = $6,
            is_prerelease = $7,
            activity_id = $8,
            published_at = CASE
              WHEN $6 = 'published' THEN COALESCE(published_at, now())
              ELSE NULL
            END,
            updated_at = now()
        WHERE id = $1 AND repository_id = $2
        RETURNING *
        "#,
    )
    .bind(current.id)
    .bind(repo.id)
    .bind(
        input
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(&current.title),
    )
    .bind(&next_body)
    .bind(sanitize_markdown_html(&next_body))
    .bind(&status)
    .bind(input.is_prerelease.unwrap_or(current.is_prerelease))
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;

    if current.status != "published" && release.status == "published" {
        deliver_release_activity(&state, &repo, &release, "Create").await?;
    }
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        release_response(&state, &repo, release, local_auth_from_release_write(&auth)).await?,
    ))
}

pub(crate) async fn delete_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag)): Path<(String, String, String)>,
) -> ApiResult<StatusCode> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    require_release_write_auth(&state, &headers, &repo).await?;
    let result = sqlx::query("DELETE FROM releases WHERE repository_id = $1 AND tag_name = $2")
        .bind(repo.id)
        .bind(tag)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn upload_release_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag)): Path<(String, String, String)>,
    mut multipart: Multipart,
) -> ApiResult<Json<ReleaseAssetResponse>> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    let auth = require_release_write_auth(&state, &headers, &repo).await?;
    let actor = release_actor(&state, &auth);
    let release = find_release_by_tag(&state, repo.id, &tag).await?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::BadRequest(error.to_string()))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let filename = sanitize_attachment_filename(field.file_name().unwrap_or("asset"));
        let content_type = field
            .content_type()
            .map(str::to_string)
            .unwrap_or_else(|| "application/octet-stream".to_string());
        let bytes = field
            .bytes()
            .await
            .map_err(|error| ApiError::BadRequest(error.to_string()))?;
        if bytes.is_empty() {
            return Err(ApiError::BadRequest("asset is empty".to_string()));
        }
        if bytes.len() > MAX_RELEASE_ASSET_BYTES {
            return Err(ApiError::BadRequest("asset is too large".to_string()));
        }

        let id = Uuid::now_v7();
        let storage_key = format!("{}/{}", release.id, id);
        let storage_path = release_asset_storage_path(&state, &storage_key);
        if let Some(parent) = storage_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&storage_path, &bytes).await?;
        let asset = sqlx::query_as::<_, ReleaseAsset>(
            r#"
            INSERT INTO release_assets
              (id, release_id, uploaded_by_actor_url, runner_id, original_filename,
               content_type, byte_size, sha256, storage_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(release.id)
        .bind(actor.actor_url)
        .bind(actor.runner_id)
        .bind(filename)
        .bind(content_type)
        .bind(bytes.len() as i64)
        .bind(format!("{:x}", Sha256::digest(&bytes)))
        .bind(storage_key)
        .fetch_one(&state.pool)
        .await?;
        return Ok(Json(release_asset_response(
            &state.config.app_base_url,
            &repo,
            &release,
            asset,
        )));
    }

    Err(ApiError::BadRequest("file field is required".to_string()))
}

pub(crate) async fn get_release_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag, asset_id, _filename)): Path<(String, String, String, Uuid, String)>,
) -> ApiResult<Response> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let release = find_release_by_tag(&state, repo.id, &tag).await?;
    if release.status != "published"
        && !release_viewer_can_manage(&state, auth.as_ref(), &repo).await?
    {
        return Err(ApiError::NotFound);
    }
    let asset = sqlx::query_as::<_, ReleaseAsset>(
        r#"
        UPDATE release_assets
        SET download_count = download_count + 1
        WHERE id = $1 AND release_id = $2 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(asset_id)
    .bind(release.id)
    .fetch_one(&state.pool)
    .await?;
    let bytes = fs::read(release_asset_storage_path(&state, &asset.storage_key)).await?;
    let mut response = Body::from(bytes).into_response();
    let headers = response.headers_mut();
    headers.insert(
        CONTENT_TYPE,
        asset
            .content_type
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
    );
    headers.insert(CONTENT_LENGTH, asset.byte_size.to_string().parse().unwrap());
    headers.insert(
        CONTENT_DISPOSITION,
        format!(
            "attachment; filename=\"{}\"",
            header_safe_filename(&asset.original_filename)
        )
        .parse()
        .unwrap(),
    );
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());
    Ok(response)
}

pub(crate) async fn delete_release_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag, asset_id)): Path<(String, String, String, Uuid)>,
) -> ApiResult<StatusCode> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    require_release_write_auth(&state, &headers, &repo).await?;
    let release = find_release_by_tag(&state, repo.id, &tag).await?;
    let result = sqlx::query(
        "UPDATE release_assets SET deleted_at = COALESCE(deleted_at, now()) WHERE id = $1 AND release_id = $2",
    )
    .bind(asset_id)
    .bind(release.id)
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn create_release_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag)): Path<(String, String, String)>,
    Json(input): Json<CommentReactionRequest>,
) -> ApiResult<Json<ReleaseResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let release = find_release_by_tag(&state, repo.id, &tag).await?;
    add_reaction(
        &state,
        &auth,
        ReactionTarget::Release(release.id),
        &input.emoji,
    )
    .await?;
    Ok(Json(
        release_response(
            &state,
            &repo,
            release,
            local_auth_from_repo_action(Some(&auth)),
        )
        .await?,
    ))
}

pub(crate) async fn delete_release_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, tag)): Path<(String, String, String)>,
    Json(input): Json<CommentReactionRequest>,
) -> ApiResult<Json<ReleaseResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let release = find_release_by_tag(&state, repo.id, &tag).await?;
    remove_reaction(
        &state,
        &auth,
        ReactionTarget::Release(release.id),
        &input.emoji,
    )
    .await?;
    Ok(Json(
        release_response(
            &state,
            &repo,
            release,
            local_auth_from_repo_action(Some(&auth)),
        )
        .await?,
    ))
}

pub(crate) async fn compare_repo_refs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, range)): Path<(String, String, String)>,
) -> ApiResult<Json<RepositoryCompareResponse>> {
    let auth = optional_auth(&state, &headers)?;
    enforce_rate_limit(
        &state,
        "repo-compare-refs",
        &format!("{owner}/{name}"),
        20,
        60,
    )
    .await?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let (base, head) = parse_compare_range(&range)?;
    Ok(Json(
        compare_refs(
            &repo,
            None,
            &format!("refs/tags/{base}"),
            &format!("refs/tags/{head}"),
        )
        .await?,
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
    let commit_sha = resolve_git_ref(&repo, query.ref_name.as_deref())
        .await?
        .ok_or(ApiError::NotFound)?;
    let path_key = repo_cache_path_key(Some(&path));
    let cache_key = cache_key(&[
        "repo",
        &repo.owner_handle,
        &repo.name,
        "file",
        &commit_sha,
        &path_key,
    ]);
    if let Some(cached) = state
        .cache
        .get_json::<RepositoryFileResponse>(&cache_key)
        .await
    {
        return Ok(Json(cached));
    }
    let response = repo_file_response_at_commit(&repo, &path, &commit_sha).await?;
    state.cache.set_json(&cache_key, &response).await;
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
    let namespace = resolve_writable_namespace(&state.pool, &auth, &auth.username).await?;

    if !requested_name {
        let existing_fork = sqlx::query_as::<_, Repository>(
            "SELECT * FROM repositories WHERE owner_handle = $1 AND source_repository_id = $2 LIMIT 1",
        )
        .bind(&namespace.name)
        .bind(source.id)
        .fetch_optional(&state.pool)
        .await?;
        if let Some(existing_fork) = existing_fork {
            return Ok(Json(
                repository_response(&state.pool, &state.config, existing_fork).await?,
            ));
        }
    }

    let fork_name = if let Some(name) = input.name.as_deref() {
        normalize_name(name)?
    } else {
        available_fork_name(&state.pool, &namespace.name, &source.name).await?
    };
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
    create_bare_repo(
        state.config.as_ref(),
        &namespace.name,
        &fork_name,
        &local_path,
    )
    .await?;

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

async fn available_fork_name(
    pool: &sqlx::PgPool,
    owner: &str,
    source_name: &str,
) -> ApiResult<String> {
    let base_name = normalize_name(source_name)?;
    let mut candidate = base_name.clone();
    let mut suffix = 0;

    loop {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM repositories WHERE owner_handle = $1 AND name = $2)",
        )
        .bind(owner)
        .bind(&candidate)
        .fetch_one(pool)
        .await?;

        if !exists {
            return Ok(candidate);
        }

        suffix += 1;
        candidate = if suffix == 1 {
            format!("{base_name}-fork")
        } else {
            format!("{base_name}-fork-{suffix}")
        };
    }
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
          (legacy_uuid, target_repository_id, source_repository_id, title, body, author_handle,
           source_repo_url, source_branch, target_branch, status, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)
        RETURNING *, '[]'::jsonb AS labels
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
    let timeline_author = issue_author(&state, &RepoActionAuth::Local(auth.clone())).await?;
    record_timeline_event(
        &state,
        target.id,
        None,
        Some(pr.id),
        &timeline_author,
        "opened",
        "opened this pull request",
        json!({ "title": pr.title.clone() }),
    )
    .await?;
    record_mention_events(
        &state,
        target.id,
        None,
        Some(pr.id),
        &timeline_author,
        &format!("{} {}", pr.title, pr.body),
    )
    .await?;

    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": "Offer",
        "actor": state.config.actor_url(&auth.username),
        "object": {
            "type": "PullRequest",
            "id": format!("{}/pull/{}", state.config.app_base_url.trim_end_matches('/'), pr.id),
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

    if let Some(labels) = input.labels.as_ref() {
        replace_pull_request_labels(&state, target.id, pr.id, labels).await?;
    }

    invalidate_repo_cache(&state, &target.owner_handle, &target.name).await;
    let response_pr = find_pull_request(&state, target.id, pr.id).await?;
    Ok(Json(
        pull_request_response(&state, &target, response_pr, Some(&auth)).await?,
    ))
}

pub(crate) async fn list_pull_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<PullRequestListQuery>,
) -> ApiResult<Json<PaginatedResponse<PullRequestResponse>>> {
    let auth = optional_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &target).await?;
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let status = normalize_pull_request_list_status_filter(query.status.as_deref())?;
    let labels = issue_label_filter(query.labels.as_deref())?;
    let search = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value));
    let total = pull_request_count(
        &state,
        target.id,
        status.as_deref(),
        search.as_deref(),
        &labels,
    )
    .await?;
    let prs = sqlx::query_as::<_, PullRequest>(
        r#"
        SELECT pull_requests.*,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', issue_labels.id, 'name', issue_labels.name, 'color', issue_labels.color) ORDER BY issue_labels.name)
            FROM pull_request_label_assignments
            JOIN issue_labels ON issue_labels.id = pull_request_label_assignments.label_id
            WHERE pull_request_label_assignments.pull_request_id = pull_requests.id
          ), '[]'::jsonb) AS labels
        FROM pull_requests
        WHERE target_repository_id = $1
          AND ($2::TEXT IS NULL OR status = $2)
          AND ($3::TEXT IS NULL OR title ILIKE $3 OR body ILIKE $3)
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($4::TEXT[]) AS requested_label(name)
            WHERE NOT EXISTS (
              SELECT 1
              FROM pull_request_label_assignments
              JOIN issue_labels ON issue_labels.id = pull_request_label_assignments.label_id
              WHERE pull_request_label_assignments.pull_request_id = pull_requests.id
                AND lower(issue_labels.name) = lower(requested_label.name)
            )
          )
        ORDER BY created_at DESC
        LIMIT $5 OFFSET $6
        "#,
    )
    .bind(target.id)
    .bind(&status)
    .bind(&search)
    .bind(labels)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;
    let mut data = Vec::with_capacity(prs.len());
    for pr in prs {
        data.push(pull_request_response(&state, &target, pr, auth.as_ref()).await?);
    }
    Ok(Json(PaginatedResponse {
        data,
        pagination: pagination(page, limit, total),
    }))
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
    Path((owner, name, id)): Path<(String, String, i64)>,
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
    Path((owner, name, id)): Path<(String, String, i64)>,
    Json(input): Json<UpdatePullRequestRequest>,
) -> ApiResult<Json<PullRequestResponse>> {
    let auth = require_auth(&state, &headers)?;
    let target = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, Some(&auth), &target).await?;
    ensure_repo_writer(&state, &auth, &target).await?;
    let current = find_pull_request(&state, target.id, id).await?;
    let current_status = current.status.clone();
    if current.status == "merged" && input.status.is_some() {
        return Err(ApiError::BadRequest(
            "merged pull requests cannot be reopened or closed".to_string(),
        ));
    }
    let requested_status = input
        .status
        .as_deref()
        .map(|_| normalize_pull_request_status(input.status.as_deref()))
        .transpose()?;
    let pr = if let Some(status) = requested_status.as_ref() {
        sqlx::query_as::<_, PullRequest>(
            r#"
            UPDATE pull_requests
            SET status = $3, updated_at = now()
            WHERE id = $1 AND target_repository_id = $2
            RETURNING *, '[]'::jsonb AS labels
            "#,
        )
        .bind(id)
        .bind(target.id)
        .bind(status.clone())
        .fetch_one(&state.pool)
        .await?
    } else {
        find_pull_request(&state, target.id, id).await?
    };
    if current_status != pr.status {
        let timeline_author = issue_author(&state, &RepoActionAuth::Local(auth.clone())).await?;
        record_timeline_event(
            &state,
            target.id,
            None,
            Some(pr.id),
            &timeline_author,
            if pr.status == "closed" {
                "closed"
            } else {
                "reopened"
            },
            if pr.status == "closed" {
                "closed this pull request"
            } else {
                "reopened this pull request"
            },
            json!({ "from": current_status, "to": pr.status.clone() }),
        )
        .await?;
    }

    if let Some(labels) = input.labels.as_ref() {
        replace_pull_request_labels(&state, target.id, pr.id, labels).await?;
    }

    invalidate_repo_cache(&state, &target.owner_handle, &target.name).await;
    let response_pr = find_pull_request(&state, target.id, id).await?;
    Ok(Json(
        pull_request_response(&state, &target, response_pr, Some(&auth)).await?,
    ))
}

pub(crate) async fn merge_pull_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, i64)>,
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
    let before_tips = git_webhook_ref_tips(&target).await?;
    merge_ref_into_branch(&target, &current.target_branch, &source_ref, &auth).await?;

    let pr = sqlx::query_as::<_, PullRequest>(
        r#"
        UPDATE pull_requests
        SET status = 'merged', updated_at = now()
        WHERE id = $1 AND target_repository_id = $2
        RETURNING *, '[]'::jsonb AS labels
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
    let timeline_author = issue_author(&state, &RepoActionAuth::Local(auth.clone())).await?;
    record_timeline_event(
        &state,
        target.id,
        None,
        Some(pr.id),
        &timeline_author,
        "merged",
        "merged this pull request",
        json!({ "from": current.status.clone(), "to": pr.status.clone() }),
    )
    .await?;

    invalidate_repo_cache(&state, &target.owner_handle, &target.name).await;
    let response_pr = find_pull_request(&state, target.id, pr.id).await?;
    let webhook_state = state.clone();
    let webhook_auth = auth.clone();
    let webhook_repo_id = target.id;
    tokio::spawn(async move {
        let repo = match sqlx::query_as::<_, Repository>("SELECT * FROM repositories WHERE id = $1")
            .bind(webhook_repo_id)
            .fetch_one(&webhook_state.pool)
            .await
        {
            Ok(repo) => repo,
            Err(error) => {
                tracing::warn!(%error, "failed to load repository for pull request merge webhooks");
                return;
            }
        };
        if let Err(error) =
            dispatch_repository_webhooks(&webhook_state, &repo, &webhook_auth, &before_tips).await
        {
            tracing::warn!(%error, "failed to dispatch repository webhooks after pull request merge");
        }
    });
    Ok(Json(
        pull_request_response(&state, &target, response_pr, Some(&auth)).await?,
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
    .bind(&author.handle)
    .bind(&author.actor_url)
    .bind(&author.display_name)
    .bind(&author.avatar_url)
    .bind(&author.remote_server)
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;

    if let Some(labels) = input.labels {
        replace_issue_labels(&state, repo.id, issue_id.0, &labels).await?;
    }
    let issue = find_issue_by_id(&state, issue_id.0).await?;
    record_timeline_event(
        &state,
        repo.id,
        Some(issue.id),
        None,
        &author,
        "opened",
        "opened this issue",
        json!({ "title": issue.title.clone() }),
    )
    .await?;
    record_mention_events(
        &state,
        repo.id,
        Some(issue.id),
        None,
        &author,
        &format!("{} {}", issue.title, issue.body),
    )
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
    let timeline_author = issue_author(&state, &auth).await?;
    if current.status != issue.status {
        record_timeline_event(
            &state,
            repo.id,
            Some(issue.id),
            None,
            &timeline_author,
            if issue.status == "closed" {
                "closed"
            } else {
                "reopened"
            },
            if issue.status == "closed" {
                "closed this issue"
            } else {
                "reopened this issue"
            },
            json!({ "from": current.status.clone(), "to": issue.status.clone() }),
        )
        .await?;
    }
    if current.title != issue.title {
        record_timeline_event(
            &state,
            repo.id,
            Some(issue.id),
            None,
            &timeline_author,
            "renamed",
            "renamed this issue",
            json!({ "from": current.title.clone(), "to": issue.title.clone() }),
        )
        .await?;
    }
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
) -> ApiResult<Json<PaginatedResponse<CommentResponse>>> {
    let auth = optional_repo_action_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(
        &state.pool,
        local_auth_from_repo_action(auth.as_ref()),
        &repo,
    )
    .await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let viewer_actor_url = auth
        .as_ref()
        .map(|auth| repo_action_actor_url(&state, auth));
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
    let mut data = Vec::with_capacity(comments.len());
    for comment in comments {
        data.push(comment_response(&state, comment, viewer_actor_url.as_deref()).await?);
    }

    Ok(Json(PaginatedResponse {
        data,
        pagination: pagination(page, limit, total.0),
    }))
}

pub(crate) async fn list_issue_activity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number)): Path<(String, String, i32)>,
    Query(query): Query<IssueListQuery>,
) -> ApiResult<Json<PaginatedResponse<ActivityItemResponse>>> {
    let auth = optional_repo_action_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(
        &state.pool,
        local_auth_from_repo_action(auth.as_ref()),
        &repo,
    )
    .await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let viewer_actor_url = auth
        .as_ref()
        .map(|auth| repo_action_actor_url(&state, auth));
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let total_comments: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM comments WHERE issue_id = $1")
            .bind(issue.id)
            .fetch_one(&state.pool)
            .await?;
    let total_events: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM timeline_events WHERE issue_id = $1")
            .bind(issue.id)
            .fetch_one(&state.pool)
            .await?;
    let query_limit = limit + offset;
    let comments = sqlx::query_as::<_, IssueComment>(
        r#"
        SELECT *
        FROM comments
        WHERE issue_id = $1
        ORDER BY created_at ASC
        LIMIT $2
        "#,
    )
    .bind(issue.id)
    .bind(query_limit)
    .fetch_all(&state.pool)
    .await?;
    let events = sqlx::query_as::<_, TimelineEvent>(
        r#"
        SELECT *
        FROM timeline_events
        WHERE issue_id = $1
        ORDER BY created_at ASC
        LIMIT $2
        "#,
    )
    .bind(issue.id)
    .bind(query_limit)
    .fetch_all(&state.pool)
    .await?;

    let data = activity_items(
        &state,
        comments,
        events,
        viewer_actor_url.as_deref(),
        offset,
        limit,
    )
    .await?;

    Ok(Json(PaginatedResponse {
        data,
        pagination: pagination(page, limit, total_comments.0 + total_events.0),
    }))
}

pub(crate) async fn create_issue_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number)): Path<(String, String, i32)>,
    Json(input): Json<CreateIssueCommentRequest>,
) -> ApiResult<Json<CommentResponse>> {
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
    .bind(&author.handle)
    .bind(&author.actor_url)
    .bind(&author.display_name)
    .bind(&author.avatar_url)
    .bind(&author.remote_server)
    .bind(&body)
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;
    let viewer_actor_url = repo_action_actor_url(&state, &auth);
    sync_comment_attachments(
        &state,
        repo.id,
        comment.id,
        &viewer_actor_url,
        input.attachment_ids.as_deref(),
    )
    .await?;
    let comment = find_comment_by_id(&state, repo.id, comment.id).await?;
    record_mention_events(
        &state,
        repo.id,
        Some(issue.id),
        None,
        &author,
        &comment.body,
    )
    .await?;

    deliver_issue_comment_activity(&state, &repo, &issue, &comment, &activity_id).await?;
    Ok(Json(
        comment_response(&state, comment, Some(&viewer_actor_url)).await?,
    ))
}

pub(crate) async fn update_issue_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number, comment_id)): Path<(String, String, i32, Uuid)>,
    Json(input): Json<UpdateCommentRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let current = find_issue_comment(&state, repo.id, issue.id, comment_id).await?;
    ensure_comment_author(&state, &current, &auth)?;
    if current.deleted_at.is_some() {
        return Err(ApiError::BadRequest(
            "deleted comments cannot be edited".to_string(),
        ));
    }
    let body = validate_comment_body(&input.body)?;
    let comment = sqlx::query_as::<_, IssueComment>(
        r#"
        UPDATE comments
        SET body = $4, updated_at = now()
        WHERE id = $1 AND repository_id = $2 AND issue_id = $3 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(comment_id)
    .bind(repo.id)
    .bind(issue.id)
    .bind(body)
    .fetch_one(&state.pool)
    .await?;
    let viewer_actor_url = repo_action_actor_url(&state, &auth);
    sync_comment_attachments(
        &state,
        repo.id,
        comment.id,
        &viewer_actor_url,
        input.attachment_ids.as_deref(),
    )
    .await?;
    let comment = find_comment_by_id(&state, repo.id, comment.id).await?;

    Ok(Json(
        comment_response(&state, comment, Some(&viewer_actor_url)).await?,
    ))
}

pub(crate) async fn delete_issue_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number, comment_id)): Path<(String, String, i32, Uuid)>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let current = find_issue_comment(&state, repo.id, issue.id, comment_id).await?;
    ensure_comment_author(&state, &current, &auth)?;
    sqlx::query("DELETE FROM reactions WHERE comment_id = $1")
        .bind(comment_id)
        .execute(&state.pool)
        .await?;
    sqlx::query("UPDATE comment_attachments SET deleted_at = COALESCE(deleted_at, now()) WHERE comment_id = $1")
        .bind(comment_id)
        .execute(&state.pool)
        .await?;
    let comment = sqlx::query_as::<_, IssueComment>(
        r#"
        UPDATE comments
        SET body = '', deleted_at = COALESCE(deleted_at, now()), updated_at = now()
        WHERE id = $1 AND repository_id = $2 AND issue_id = $3
        RETURNING *
        "#,
    )
    .bind(comment_id)
    .bind(repo.id)
    .bind(issue.id)
    .fetch_one(&state.pool)
    .await?;
    let viewer_actor_url = repo_action_actor_url(&state, &auth);

    Ok(Json(
        comment_response(&state, comment, Some(&viewer_actor_url)).await?,
    ))
}

pub(crate) async fn create_issue_comment_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number, comment_id)): Path<(String, String, i32, Uuid)>,
    Json(input): Json<CommentReactionRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let comment = find_issue_comment(&state, repo.id, issue.id, comment_id).await?;
    add_reaction(
        &state,
        &auth,
        ReactionTarget::Comment(comment.id),
        &input.emoji,
    )
    .await?;
    let actor_url = repo_action_actor_url(&state, &auth);

    Ok(Json(
        comment_response(&state, comment, Some(&actor_url)).await?,
    ))
}

pub(crate) async fn delete_issue_comment_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, number, comment_id)): Path<(String, String, i32, Uuid)>,
    Json(input): Json<CommentReactionRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let issue = find_issue(&state, repo.id, number).await?;
    let comment = find_issue_comment(&state, repo.id, issue.id, comment_id).await?;
    remove_reaction(
        &state,
        &auth,
        ReactionTarget::Comment(comment.id),
        &input.emoji,
    )
    .await?;
    let actor_url = repo_action_actor_url(&state, &auth);

    Ok(Json(
        comment_response(&state, comment, Some(&actor_url)).await?,
    ))
}

pub(crate) async fn list_pull_request_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, i64)>,
    Query(query): Query<IssueListQuery>,
) -> ApiResult<Json<PaginatedResponse<CommentResponse>>> {
    let auth = optional_repo_action_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(
        &state.pool,
        local_auth_from_repo_action(auth.as_ref()),
        &repo,
    )
    .await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
    let viewer_actor_url = auth
        .as_ref()
        .map(|auth| repo_action_actor_url(&state, auth));
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM comments WHERE pull_request_id = $1")
        .bind(pr.id)
        .fetch_one(&state.pool)
        .await?;
    let comments = sqlx::query_as::<_, IssueComment>(
        r#"
        SELECT *
        FROM comments
        WHERE pull_request_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(pr.id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;
    let mut data = Vec::with_capacity(comments.len());
    for comment in comments {
        data.push(comment_response(&state, comment, viewer_actor_url.as_deref()).await?);
    }

    Ok(Json(PaginatedResponse {
        data,
        pagination: pagination(page, limit, total.0),
    }))
}

pub(crate) async fn list_pull_request_activity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, i64)>,
    Query(query): Query<IssueListQuery>,
) -> ApiResult<Json<PaginatedResponse<ActivityItemResponse>>> {
    let auth = optional_repo_action_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(
        &state.pool,
        local_auth_from_repo_action(auth.as_ref()),
        &repo,
    )
    .await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
    let viewer_actor_url = auth
        .as_ref()
        .map(|auth| repo_action_actor_url(&state, auth));
    let (page, limit, offset) = pagination_input(query.page, query.limit);
    let total_comments: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM comments WHERE pull_request_id = $1")
            .bind(pr.id)
            .fetch_one(&state.pool)
            .await?;
    let total_events: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM timeline_events WHERE pull_request_id = $1")
            .bind(pr.id)
            .fetch_one(&state.pool)
            .await?;
    let query_limit = limit + offset;
    let comments = sqlx::query_as::<_, IssueComment>(
        r#"
        SELECT *
        FROM comments
        WHERE pull_request_id = $1
        ORDER BY created_at ASC
        LIMIT $2
        "#,
    )
    .bind(pr.id)
    .bind(query_limit)
    .fetch_all(&state.pool)
    .await?;
    let events = sqlx::query_as::<_, TimelineEvent>(
        r#"
        SELECT *
        FROM timeline_events
        WHERE pull_request_id = $1
        ORDER BY created_at ASC
        LIMIT $2
        "#,
    )
    .bind(pr.id)
    .bind(query_limit)
    .fetch_all(&state.pool)
    .await?;

    let data = activity_items(
        &state,
        comments,
        events,
        viewer_actor_url.as_deref(),
        offset,
        limit,
    )
    .await?;

    Ok(Json(PaginatedResponse {
        data,
        pagination: pagination(page, limit, total_comments.0 + total_events.0),
    }))
}

pub(crate) async fn create_pull_request_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id)): Path<(String, String, i64)>,
    Json(input): Json<CreateIssueCommentRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
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
          (id, repository_id, pull_request_id, author_handle, author_actor_url,
           author_display_name, author_avatar_url, remote_server, body, activity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repo.id)
    .bind(pr.id)
    .bind(&author.handle)
    .bind(&author.actor_url)
    .bind(&author.display_name)
    .bind(&author.avatar_url)
    .bind(&author.remote_server)
    .bind(&body)
    .bind(&activity_id)
    .fetch_one(&state.pool)
    .await?;
    let viewer_actor_url = repo_action_actor_url(&state, &auth);
    sync_comment_attachments(
        &state,
        repo.id,
        comment.id,
        &viewer_actor_url,
        input.attachment_ids.as_deref(),
    )
    .await?;
    let comment = find_comment_by_id(&state, repo.id, comment.id).await?;
    record_mention_events(&state, repo.id, None, Some(pr.id), &author, &comment.body).await?;

    Ok(Json(
        comment_response(&state, comment, Some(&viewer_actor_url)).await?,
    ))
}

pub(crate) async fn update_pull_request_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id, comment_id)): Path<(String, String, i64, Uuid)>,
    Json(input): Json<UpdateCommentRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
    let current = find_pull_request_comment(&state, repo.id, pr.id, comment_id).await?;
    ensure_comment_author(&state, &current, &auth)?;
    if current.deleted_at.is_some() {
        return Err(ApiError::BadRequest(
            "deleted comments cannot be edited".to_string(),
        ));
    }
    let body = validate_comment_body(&input.body)?;
    let comment = sqlx::query_as::<_, IssueComment>(
        r#"
        UPDATE comments
        SET body = $4, updated_at = now()
        WHERE id = $1 AND repository_id = $2 AND pull_request_id = $3 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(comment_id)
    .bind(repo.id)
    .bind(pr.id)
    .bind(body)
    .fetch_one(&state.pool)
    .await?;
    let viewer_actor_url = repo_action_actor_url(&state, &auth);
    sync_comment_attachments(
        &state,
        repo.id,
        comment.id,
        &viewer_actor_url,
        input.attachment_ids.as_deref(),
    )
    .await?;
    let comment = find_comment_by_id(&state, repo.id, comment.id).await?;

    Ok(Json(
        comment_response(&state, comment, Some(&viewer_actor_url)).await?,
    ))
}

pub(crate) async fn delete_pull_request_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id, comment_id)): Path<(String, String, i64, Uuid)>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
    let current = find_pull_request_comment(&state, repo.id, pr.id, comment_id).await?;
    ensure_comment_author(&state, &current, &auth)?;
    sqlx::query("DELETE FROM reactions WHERE comment_id = $1")
        .bind(comment_id)
        .execute(&state.pool)
        .await?;
    sqlx::query("UPDATE comment_attachments SET deleted_at = COALESCE(deleted_at, now()) WHERE comment_id = $1")
        .bind(comment_id)
        .execute(&state.pool)
        .await?;
    let comment = sqlx::query_as::<_, IssueComment>(
        r#"
        UPDATE comments
        SET body = '', deleted_at = COALESCE(deleted_at, now()), updated_at = now()
        WHERE id = $1 AND repository_id = $2 AND pull_request_id = $3
        RETURNING *
        "#,
    )
    .bind(comment_id)
    .bind(repo.id)
    .bind(pr.id)
    .fetch_one(&state.pool)
    .await?;
    let viewer_actor_url = repo_action_actor_url(&state, &auth);

    Ok(Json(
        comment_response(&state, comment, Some(&viewer_actor_url)).await?,
    ))
}

pub(crate) async fn create_pull_request_comment_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id, comment_id)): Path<(String, String, i64, Uuid)>,
    Json(input): Json<CommentReactionRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
    let comment = find_pull_request_comment(&state, repo.id, pr.id, comment_id).await?;
    if comment.deleted_at.is_some() {
        return Err(ApiError::BadRequest(
            "deleted comments cannot receive reactions".to_string(),
        ));
    }
    add_reaction(
        &state,
        &auth,
        ReactionTarget::Comment(comment.id),
        &input.emoji,
    )
    .await?;
    let actor_url = repo_action_actor_url(&state, &auth);

    Ok(Json(
        comment_response(&state, comment, Some(&actor_url)).await?,
    ))
}

pub(crate) async fn delete_pull_request_comment_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, id, comment_id)): Path<(String, String, i64, Uuid)>,
    Json(input): Json<CommentReactionRequest>,
) -> ApiResult<Json<CommentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let pr = find_pull_request(&state, repo.id, id).await?;
    let comment = find_pull_request_comment(&state, repo.id, pr.id, comment_id).await?;
    remove_reaction(
        &state,
        &auth,
        ReactionTarget::Comment(comment.id),
        &input.emoji,
    )
    .await?;
    let actor_url = repo_action_actor_url(&state, &auth);

    Ok(Json(
        comment_response(&state, comment, Some(&actor_url)).await?,
    ))
}

pub(crate) async fn upload_comment_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    mut multipart: Multipart,
) -> ApiResult<Json<CommentAttachmentResponse>> {
    let auth = require_repo_action_auth(&state, &headers, "repo:comment")?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_action_visible(&state.pool, &auth, &repo).await?;
    let actor_url = repo_action_actor_url(&state, &auth);

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::BadRequest(error.to_string()))?
    {
        if field.name() != Some("file") {
            continue;
        }
        let filename = sanitize_attachment_filename(field.file_name().unwrap_or("attachment"));
        let content_type = field
            .content_type()
            .map(str::to_string)
            .unwrap_or_else(|| "application/octet-stream".to_string());
        let bytes = field
            .bytes()
            .await
            .map_err(|error| ApiError::BadRequest(error.to_string()))?;
        if bytes.is_empty() {
            return Err(ApiError::BadRequest("attachment is empty".to_string()));
        }
        if bytes.len() > MAX_COMMENT_ATTACHMENT_BYTES {
            return Err(ApiError::BadRequest("attachment is too large".to_string()));
        }

        let id = Uuid::now_v7();
        let storage_key = id.to_string();
        let storage_path = comment_attachment_storage_path(&state, &storage_key);
        if let Some(parent) = storage_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&storage_path, &bytes).await?;
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        let attachment = sqlx::query_as::<_, CommentAttachment>(
            r#"
            INSERT INTO comment_attachments
              (id, repository_id, uploaded_by_actor_url, original_filename,
               content_type, byte_size, sha256, storage_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(repo.id)
        .bind(actor_url)
        .bind(filename)
        .bind(content_type)
        .bind(bytes.len() as i64)
        .bind(sha256)
        .bind(storage_key)
        .fetch_one(&state.pool)
        .await?;

        return Ok(Json(comment_attachment_response(
            &state.config.app_base_url,
            &repo,
            attachment,
        )));
    }

    Err(ApiError::BadRequest("file field is required".to_string()))
}

pub(crate) async fn get_comment_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, attachment_id, _filename)): Path<(String, String, Uuid, String)>,
) -> ApiResult<Response> {
    let auth = optional_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, auth.as_ref(), &repo).await?;
    let attachment = sqlx::query_as::<_, CommentAttachment>(
        r#"
        SELECT *
        FROM comment_attachments
        WHERE id = $1 AND repository_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(attachment_id)
    .bind(repo.id)
    .fetch_one(&state.pool)
    .await?;
    let path = comment_attachment_storage_path(&state, &attachment.storage_key);
    let bytes = fs::read(path).await?;

    let mut response = Body::from(bytes).into_response();
    let headers = response.headers_mut();
    headers.insert(
        CONTENT_TYPE,
        attachment
            .content_type
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
    );
    headers.insert(
        CONTENT_LENGTH,
        attachment.byte_size.to_string().parse().unwrap(),
    );
    headers.insert(
        CONTENT_DISPOSITION,
        format!(
            "{}; filename=\"{}\"",
            if attachment_is_inline_image(&attachment.content_type) {
                "inline"
            } else {
                "attachment"
            },
            header_safe_filename(&attachment.original_filename)
        )
        .parse()
        .unwrap(),
    );
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());

    Ok(response)
}

struct IssueAuthor {
    handle: String,
    actor_url: Option<String>,
    display_name: String,
    avatar_url: Option<String>,
    remote_server: Option<String>,
}

#[derive(sqlx::FromRow)]
struct CommentReactionAggregate {
    emoji: String,
    count: i64,
    viewer_reacted: bool,
}

enum ReleaseWriteAuth {
    User(AuthUser),
    Runner(Runner),
}

struct ReleaseActor {
    actor_url: String,
    handle: String,
    display_name: String,
    runner_id: Option<Uuid>,
}

async fn release_viewer_can_manage(
    state: &AppState,
    auth: Option<&AuthUser>,
    repo: &Repository,
) -> ApiResult<bool> {
    let Some(auth) = auth else {
        return Ok(false);
    };
    can_update_pull_request(state, auth, repo).await
}

async fn require_release_write_auth(
    state: &AppState,
    headers: &HeaderMap,
    repo: &Repository,
) -> ApiResult<ReleaseWriteAuth> {
    if let Ok(auth) = require_auth(state, headers) {
        ensure_repo_visible(&state.pool, Some(&auth), repo).await?;
        ensure_repo_writer(state, &auth, repo).await?;
        return Ok(ReleaseWriteAuth::User(auth));
    }

    let token = bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    let runner = sqlx::query_as::<_, Runner>(
        r#"
        SELECT id, scope_kind, user_id, organization_id, repository_id, name, labels,
               version, status, last_seen_at, created_at
        FROM runners
        WHERE token_hash = $1 AND status != 'disabled'
        "#,
    )
    .bind(token_hash(token))
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::Unauthorized)?;
    ensure_runner_can_release(state, &runner, repo).await?;
    sqlx::query("UPDATE runners SET last_seen_at = now(), status = 'online' WHERE id = $1")
        .bind(runner.id)
        .execute(&state.pool)
        .await?;
    Ok(ReleaseWriteAuth::Runner(runner))
}

async fn ensure_runner_can_release(
    state: &AppState,
    runner: &Runner,
    repo: &Repository,
) -> ApiResult<()> {
    match runner.scope_kind.as_str() {
        "server" => Ok(()),
        "repository" if runner.repository_id == Some(repo.id) => Ok(()),
        "user" if runner.user_id == repo.owner_id => Ok(()),
        "organization" => {
            let organization_id: Option<Uuid> =
                sqlx::query_scalar("SELECT organization_id FROM namespaces WHERE name = $1")
                    .bind(&repo.owner_handle)
                    .fetch_optional(&state.pool)
                    .await?
                    .flatten();
            if organization_id.is_some() && organization_id == runner.organization_id {
                Ok(())
            } else {
                Err(ApiError::Forbidden(
                    "runner scope does not allow publishing this repository".to_string(),
                ))
            }
        }
        _ => Err(ApiError::Forbidden(
            "runner scope does not allow publishing this repository".to_string(),
        )),
    }
}

fn release_actor(state: &AppState, auth: &ReleaseWriteAuth) -> ReleaseActor {
    match auth {
        ReleaseWriteAuth::User(auth) => ReleaseActor {
            actor_url: state.config.actor_url(&auth.username),
            handle: auth.username.clone(),
            display_name: auth.username.clone(),
            runner_id: None,
        },
        ReleaseWriteAuth::Runner(runner) => ReleaseActor {
            actor_url: format!(
                "{}/actions/runners/{}",
                state.config.app_base_url.trim_end_matches('/'),
                runner.id
            ),
            handle: runner.name.clone(),
            display_name: format!("{} runner", runner.name),
            runner_id: Some(runner.id),
        },
    }
}

fn local_auth_from_release_write(auth: &ReleaseWriteAuth) -> Option<&AuthUser> {
    match auth {
        ReleaseWriteAuth::User(auth) => Some(auth),
        ReleaseWriteAuth::Runner(_) => None,
    }
}

async fn find_release_by_tag(
    state: &AppState,
    repository_id: Uuid,
    tag_name: &str,
) -> ApiResult<Release> {
    Ok(sqlx::query_as::<_, Release>(
        "SELECT * FROM releases WHERE repository_id = $1 AND tag_name = $2",
    )
    .bind(repository_id)
    .bind(tag_name)
    .fetch_one(&state.pool)
    .await?)
}

async fn release_response(
    state: &AppState,
    repo: &Repository,
    release: Release,
    viewer: Option<&AuthUser>,
) -> ApiResult<ReleaseResponse> {
    let assets = release_assets(state, repo, &release).await?;
    let viewer_actor_url = viewer.map(|auth| state.config.actor_url(&auth.username));
    let reactions = reactions_for_target(
        state,
        ReactionTarget::Release(release.id),
        viewer_actor_url.as_deref(),
    )
    .await?;
    let last_commit = git_last_commit(repo, &release.target_commit_sha, None).await?;
    let viewer_can_update = match viewer {
        Some(auth) => can_update_pull_request(state, auth, repo).await?,
        None => false,
    };
    Ok(ReleaseResponse {
        id: release.id,
        repository_id: release.repository_id,
        tag_name: release.tag_name,
        target_commit_sha: release.target_commit_sha,
        title: release.title,
        body: release.body,
        body_html: release.body_html,
        author_actor_url: release.author_actor_url,
        author_handle: release.author_handle,
        author_display_name: release.author_display_name,
        status: release.status,
        is_prerelease: release.is_prerelease,
        activity_id: release.activity_id,
        assets,
        reactions,
        last_commit,
        viewer_can_update,
        published_at: release.published_at,
        created_at: release.created_at,
        updated_at: release.updated_at,
    })
}

async fn release_assets(
    state: &AppState,
    repo: &Repository,
    release: &Release,
) -> ApiResult<Vec<ReleaseAssetResponse>> {
    let assets = sqlx::query_as::<_, ReleaseAsset>(
        r#"
        SELECT *
        FROM release_assets
        WHERE release_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC
        "#,
    )
    .bind(release.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(assets
        .into_iter()
        .map(|asset| release_asset_response(&state.config.app_base_url, repo, release, asset))
        .collect())
}

fn release_asset_response(
    app_base_url: &str,
    repo: &Repository,
    release: &Release,
    asset: ReleaseAsset,
) -> ReleaseAssetResponse {
    let url = format!(
        "{}/repos/{}/{}/releases/{}/assets/{}/{}",
        app_base_url.trim_end_matches('/'),
        url_path_segment(&repo.owner_handle),
        url_path_segment(&repo.name),
        url_path_segment(&release.tag_name),
        asset.id,
        url_path_segment(&asset.original_filename)
    );
    let is_image = attachment_is_inline_image(&asset.content_type);
    let markdown = if is_image {
        format!("![{}]({})", asset.original_filename, url)
    } else {
        format!("[{}]({})", asset.original_filename, url)
    };
    ReleaseAssetResponse {
        id: asset.id,
        filename: asset.original_filename,
        content_type: asset.content_type,
        size: asset.byte_size,
        sha256: asset.sha256,
        url,
        markdown,
        is_image,
        download_count: asset.download_count,
        created_at: asset.created_at,
    }
}

fn release_asset_storage_path(state: &AppState, storage_key: &str) -> PathBuf {
    state
        .config
        .attachment_storage_path
        .join("releases")
        .join(storage_key)
}

fn optional_repo_action_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> ApiResult<Option<RepoActionAuth>> {
    if bearer_token(headers).is_none() {
        return Ok(None);
    }
    Ok(Some(match require_current_user(state, headers)? {
        Ok(auth) => RepoActionAuth::Local(auth),
        Err(auth) => RepoActionAuth::Federated(auth),
    }))
}

fn local_auth_from_repo_action(auth: Option<&RepoActionAuth>) -> Option<&AuthUser> {
    match auth {
        Some(RepoActionAuth::Local(auth)) => Some(auth),
        _ => None,
    }
}

fn repo_action_actor_url(state: &AppState, auth: &RepoActionAuth) -> String {
    match auth {
        RepoActionAuth::Local(auth) => state.config.actor_url(&auth.username),
        RepoActionAuth::Federated(auth) => auth.actor_url.clone(),
    }
}

fn ensure_comment_author(
    state: &AppState,
    comment: &IssueComment,
    auth: &RepoActionAuth,
) -> ApiResult<()> {
    let actor_url = repo_action_actor_url(state, auth);
    if comment.author_actor_url.as_deref() == Some(actor_url.as_str()) {
        return Ok(());
    }
    if let RepoActionAuth::Local(auth) = auth {
        if comment.author_actor_url.is_none()
            && comment.remote_server.is_none()
            && comment.author_handle == auth.username
        {
            return Ok(());
        }
    }
    Err(ApiError::Unauthorized)
}

async fn find_pull_request_comment(
    state: &AppState,
    repository_id: Uuid,
    pull_request_id: i64,
    comment_id: Uuid,
) -> ApiResult<IssueComment> {
    Ok(sqlx::query_as::<_, IssueComment>(
        r#"
        SELECT *
        FROM comments
        WHERE id = $1 AND repository_id = $2 AND pull_request_id = $3
        "#,
    )
    .bind(comment_id)
    .bind(repository_id)
    .bind(pull_request_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn find_issue_comment(
    state: &AppState,
    repository_id: Uuid,
    issue_id: Uuid,
    comment_id: Uuid,
) -> ApiResult<IssueComment> {
    Ok(sqlx::query_as::<_, IssueComment>(
        r#"
        SELECT *
        FROM comments
        WHERE id = $1 AND repository_id = $2 AND issue_id = $3
        "#,
    )
    .bind(comment_id)
    .bind(repository_id)
    .bind(issue_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn find_comment_by_id(
    state: &AppState,
    repository_id: Uuid,
    comment_id: Uuid,
) -> ApiResult<IssueComment> {
    Ok(sqlx::query_as::<_, IssueComment>(
        "SELECT * FROM comments WHERE id = $1 AND repository_id = $2",
    )
    .bind(comment_id)
    .bind(repository_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn comment_response(
    state: &AppState,
    comment: IssueComment,
    viewer_actor_url: Option<&str>,
) -> ApiResult<CommentResponse> {
    let reactions = if comment.deleted_at.is_some() {
        Vec::new()
    } else {
        reactions_for_target(state, ReactionTarget::Comment(comment.id), viewer_actor_url).await?
    };
    let viewer_can_update = comment.deleted_at.is_none()
        && viewer_actor_url
            .and_then(|actor| {
                comment
                    .author_actor_url
                    .as_deref()
                    .map(|author| author == actor)
            })
            .unwrap_or(false);
    let body = if comment.deleted_at.is_some() {
        String::new()
    } else {
        comment.body
    };
    let body_html = sanitize_markdown_html(&body);
    let attachments = if comment.deleted_at.is_some() {
        Vec::new()
    } else {
        comment_attachments(state, comment.repository_id, comment.id).await?
    };

    Ok(CommentResponse {
        id: comment.id,
        repository_id: comment.repository_id,
        pull_request_id: comment.pull_request_id,
        issue_id: comment.issue_id,
        author_handle: comment.author_handle,
        author_actor_url: comment.author_actor_url,
        author_display_name: comment.author_display_name,
        author_avatar_url: comment.author_avatar_url,
        remote_server: comment.remote_server,
        body,
        body_html,
        activity_id: comment.activity_id,
        reactions,
        attachments,
        viewer_can_update,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        deleted_at: comment.deleted_at,
    })
}

async fn activity_items(
    state: &AppState,
    comments: Vec<IssueComment>,
    events: Vec<TimelineEvent>,
    viewer_actor_url: Option<&str>,
    offset: i64,
    limit: i64,
) -> ApiResult<Vec<ActivityItemResponse>> {
    let mut data = Vec::with_capacity(comments.len() + events.len());
    for comment in comments {
        let created_at = comment.created_at;
        data.push(ActivityItemResponse {
            kind: "comment".to_string(),
            comment: Some(comment_response(state, comment, viewer_actor_url).await?),
            event: None,
            created_at,
        });
    }
    for event in events {
        let created_at = event.created_at;
        data.push(ActivityItemResponse {
            kind: "event".to_string(),
            comment: None,
            event: Some(timeline_event_response(event)),
            created_at,
        });
    }
    data.sort_by(|left, right| left.created_at.cmp(&right.created_at));
    Ok(data
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .collect())
}

fn timeline_event_response(event: TimelineEvent) -> TimelineEventResponse {
    TimelineEventResponse {
        id: event.id,
        event_type: event.event_type,
        body: event.body,
        actor_handle: event.actor_handle,
        actor_actor_url: event.actor_actor_url,
        actor_display_name: event.actor_display_name,
        actor_avatar_url: event.actor_avatar_url,
        remote_server: event.remote_server,
        metadata: event.metadata,
        created_at: event.created_at,
    }
}

async fn record_timeline_event(
    state: &AppState,
    repository_id: Uuid,
    issue_id: Option<Uuid>,
    pull_request_id: Option<i64>,
    author: &IssueAuthor,
    event_type: &str,
    body: impl Into<String>,
    metadata: Value,
) -> ApiResult<()> {
    sqlx::query(
        r#"
        INSERT INTO timeline_events
          (id, repository_id, issue_id, pull_request_id, actor_handle, actor_actor_url,
           actor_display_name, actor_avatar_url, remote_server, event_type, body, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repository_id)
    .bind(issue_id)
    .bind(pull_request_id)
    .bind(&author.handle)
    .bind(&author.actor_url)
    .bind(&author.display_name)
    .bind(&author.avatar_url)
    .bind(&author.remote_server)
    .bind(event_type)
    .bind(body.into())
    .bind(metadata)
    .execute(&state.pool)
    .await?;
    Ok(())
}

async fn record_mention_events(
    state: &AppState,
    repository_id: Uuid,
    issue_id: Option<Uuid>,
    pull_request_id: Option<i64>,
    author: &IssueAuthor,
    content: &str,
) -> ApiResult<()> {
    let mentions = mentioned_handles(content);
    if mentions.is_empty() {
        return Ok(());
    }
    let body = format!(
        "mentioned {}",
        mentions
            .iter()
            .map(|mention| format!("@{mention}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    record_timeline_event(
        state,
        repository_id,
        issue_id,
        pull_request_id,
        author,
        "mentioned",
        body,
        json!({ "mentions": mentions }),
    )
    .await
}

fn mentioned_handles(content: &str) -> Vec<String> {
    let mut mentions = BTreeSet::new();
    let chars: Vec<char> = content.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != '@' {
            index += 1;
            continue;
        }
        let previous = index
            .checked_sub(1)
            .and_then(|previous| chars.get(previous))
            .copied();
        if previous.is_some_and(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-') {
            index += 1;
            continue;
        }
        let mut end = index + 1;
        while end < chars.len()
            && (chars[end].is_ascii_alphanumeric() || chars[end] == '_' || chars[end] == '-')
        {
            end += 1;
        }
        if end > index + 1 {
            mentions.insert(chars[index + 1..end].iter().collect::<String>());
        }
        index = end.max(index + 1);
    }
    mentions.into_iter().collect()
}

async fn comment_attachments(
    state: &AppState,
    repository_id: Option<Uuid>,
    comment_id: Uuid,
) -> ApiResult<Vec<CommentAttachmentResponse>> {
    let Some(repository_id) = repository_id else {
        return Ok(Vec::new());
    };
    let repo: Repository = sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
        .bind(repository_id)
        .fetch_one(&state.pool)
        .await?;
    let attachments = sqlx::query_as::<_, CommentAttachment>(
        r#"
        SELECT *
        FROM comment_attachments
        WHERE repository_id = $1 AND comment_id = $2 AND deleted_at IS NULL
        ORDER BY created_at ASC
        "#,
    )
    .bind(repository_id)
    .bind(comment_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(attachments
        .into_iter()
        .map(|attachment| {
            comment_attachment_response(&state.config.app_base_url, &repo, attachment)
        })
        .collect())
}

async fn sync_comment_attachments(
    state: &AppState,
    repository_id: Uuid,
    comment_id: Uuid,
    actor_url: &str,
    attachment_ids: Option<&[Uuid]>,
) -> ApiResult<()> {
    let Some(attachment_ids) = attachment_ids else {
        return Ok(());
    };
    sqlx::query(
        r#"
        UPDATE comment_attachments
        SET deleted_at = COALESCE(deleted_at, now())
        WHERE repository_id = $1
          AND comment_id = $2
          AND NOT (id = ANY($3))
        "#,
    )
    .bind(repository_id)
    .bind(comment_id)
    .bind(attachment_ids)
    .execute(&state.pool)
    .await?;
    if attachment_ids.is_empty() {
        return Ok(());
    }
    sqlx::query(
        r#"
        UPDATE comment_attachments
        SET comment_id = $2, attached_at = COALESCE(attached_at, now()), deleted_at = NULL
        WHERE repository_id = $1
          AND id = ANY($3)
          AND uploaded_by_actor_url = $4
          AND (comment_id IS NULL OR comment_id = $2)
        "#,
    )
    .bind(repository_id)
    .bind(comment_id)
    .bind(attachment_ids)
    .bind(actor_url)
    .execute(&state.pool)
    .await?;
    Ok(())
}

#[derive(Clone, Copy)]
enum ReactionTarget {
    Comment(Uuid),
    Release(Uuid),
}

async fn add_reaction(
    state: &AppState,
    auth: &RepoActionAuth,
    target: ReactionTarget,
    emoji: &str,
) -> ApiResult<()> {
    let emoji = validate_comment_reaction(emoji)?;
    let actor = issue_author(state, auth).await?;
    let actor_url = actor.actor_url.clone().ok_or(ApiError::Unauthorized)?;
    match target {
        ReactionTarget::Comment(comment_id) => {
            let comment = sqlx::query_as::<_, IssueComment>("SELECT * FROM comments WHERE id = $1")
                .bind(comment_id)
                .fetch_one(&state.pool)
                .await?;
            if comment.deleted_at.is_some() {
                return Err(ApiError::BadRequest(
                    "deleted comments cannot receive reactions".to_string(),
                ));
            }
            sqlx::query(
                r#"
                INSERT INTO reactions (id, comment_id, emoji, actor_url, actor_display_name, remote_server)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(comment_id)
            .bind(emoji)
            .bind(&actor_url)
            .bind(actor.display_name)
            .bind(actor.remote_server)
            .execute(&state.pool)
            .await?;
        }
        ReactionTarget::Release(release_id) => {
            sqlx::query(
                r#"
                INSERT INTO reactions (id, release_id, emoji, actor_url, actor_display_name, remote_server)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(Uuid::now_v7())
            .bind(release_id)
            .bind(emoji)
            .bind(&actor_url)
            .bind(actor.display_name)
            .bind(actor.remote_server)
            .execute(&state.pool)
            .await?;
        }
    }
    Ok(())
}

async fn remove_reaction(
    state: &AppState,
    auth: &RepoActionAuth,
    target: ReactionTarget,
    emoji: &str,
) -> ApiResult<()> {
    let emoji = validate_comment_reaction(emoji)?;
    let actor_url = repo_action_actor_url(state, auth);
    match target {
        ReactionTarget::Comment(comment_id) => {
            sqlx::query(
                "DELETE FROM reactions WHERE comment_id = $1 AND emoji = $2 AND actor_url = $3",
            )
            .bind(comment_id)
            .bind(emoji)
            .bind(actor_url)
            .execute(&state.pool)
            .await?;
        }
        ReactionTarget::Release(release_id) => {
            sqlx::query(
                "DELETE FROM reactions WHERE release_id = $1 AND emoji = $2 AND actor_url = $3",
            )
            .bind(release_id)
            .bind(emoji)
            .bind(actor_url)
            .execute(&state.pool)
            .await?;
        }
    }
    Ok(())
}

async fn reactions_for_target(
    state: &AppState,
    target: ReactionTarget,
    viewer_actor_url: Option<&str>,
) -> ApiResult<Vec<CommentReactionResponse>> {
    let viewer_actor_url = viewer_actor_url.unwrap_or("");
    let aggregates = match target {
        ReactionTarget::Comment(comment_id) => {
            sqlx::query_as::<_, CommentReactionAggregate>(
                r#"
                SELECT emoji,
                       COUNT(*)::BIGINT AS count,
                       COALESCE(BOOL_OR(actor_url = $2), false) AS viewer_reacted
                FROM reactions
                WHERE comment_id = $1
                GROUP BY emoji
                "#,
            )
            .bind(comment_id)
            .bind(viewer_actor_url)
            .fetch_all(&state.pool)
            .await?
        }
        ReactionTarget::Release(release_id) => {
            sqlx::query_as::<_, CommentReactionAggregate>(
                r#"
                SELECT emoji,
                       COUNT(*)::BIGINT AS count,
                       COALESCE(BOOL_OR(actor_url = $2), false) AS viewer_reacted
                FROM reactions
                WHERE release_id = $1
                GROUP BY emoji
                "#,
            )
            .bind(release_id)
            .bind(viewer_actor_url)
            .fetch_all(&state.pool)
            .await?
        }
    };

    Ok(aggregates
        .into_iter()
        .filter(|item| item.count > 0)
        .map(|item| CommentReactionResponse {
            emoji: item.emoji,
            count: item.count,
            viewer_reacted: item.viewer_reacted,
        })
        .collect())
}

fn validate_comment_reaction(emoji: &str) -> ApiResult<&'static str> {
    let emoji = emoji.trim();
    FIXED_COMMENT_REACTIONS
        .iter()
        .copied()
        .find(|allowed| *allowed == emoji)
        .ok_or_else(|| ApiError::BadRequest("unsupported reaction emoji".to_string()))
}

fn sanitize_markdown_html(markdown: &str) -> String {
    let mut options = MarkdownOptions::empty();
    options.insert(MarkdownOptions::ENABLE_STRIKETHROUGH);
    options.insert(MarkdownOptions::ENABLE_TABLES);
    options.insert(MarkdownOptions::ENABLE_TASKLISTS);

    let parser = MarkdownParser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    ammonia::clean(&html_output)
}

fn normalize_release_status(value: Option<&str>) -> ApiResult<Option<&'static str>> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some("draft") => Ok(Some("draft")),
        Some("published") => Ok(Some("published")),
        Some(_) => Err(ApiError::BadRequest("invalid release status".to_string())),
    }
}

fn normalize_release_status_filter(value: Option<&str>) -> ApiResult<Option<String>> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("all") => Ok(None),
        Some("draft") => Ok(Some("draft".to_string())),
        Some("published") => Ok(Some("published".to_string())),
        Some(_) => Err(ApiError::BadRequest("invalid release status".to_string())),
    }
}

fn validate_release_tag_name(value: &str) -> ApiResult<String> {
    let tag = value.trim();
    if tag.is_empty()
        || tag.starts_with('-')
        || tag.starts_with('/')
        || tag.ends_with('/')
        || tag.contains('\0')
        || tag.contains("..")
        || tag.contains("//")
        || tag.contains("@{")
        || tag.chars().any(char::is_whitespace)
        || tag.chars().any(char::is_control)
    {
        return Err(ApiError::BadRequest("invalid release tag".to_string()));
    }
    Ok(tag.to_string())
}

async fn resolve_or_create_release_tag(
    repo: &Repository,
    tag_name: &str,
    target_ref: Option<&str>,
) -> ApiResult<String> {
    if let Some(commit_sha) = resolve_git_ref(repo, Some(&format!("refs/tags/{tag_name}"))).await? {
        return Ok(commit_sha);
    }

    let target_ref = validate_release_target_ref(target_ref)?;
    let target_commit_sha = resolve_git_ref(repo, Some(target_ref))
        .await?
        .ok_or_else(|| ApiError::BadRequest("target branch or ref does not exist".to_string()))?;
    run_git_command(
        repo,
        &[
            "tag".to_string(),
            tag_name.to_string(),
            target_commit_sha.clone(),
        ],
    )
    .await?;
    Ok(target_commit_sha)
}

fn validate_release_target_ref(value: Option<&str>) -> ApiResult<&str> {
    let target_ref = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ApiError::BadRequest("target branch is required when creating a new tag".to_string())
        })?;
    if target_ref.starts_with('-')
        || target_ref.contains('\0')
        || target_ref.contains("..")
        || target_ref.contains("@{")
        || target_ref.chars().any(char::is_control)
    {
        return Err(ApiError::BadRequest("invalid target branch".to_string()));
    }
    Ok(target_ref)
}

fn parse_compare_range(range: &str) -> ApiResult<(String, String)> {
    let Some((base, head)) = range.split_once("...") else {
        return Err(ApiError::BadRequest(
            "compare range must use base...head".to_string(),
        ));
    };
    Ok((
        validate_release_tag_name(base)?,
        validate_release_tag_name(head)?,
    ))
}

async fn release_body_from_input(
    state: &AppState,
    repo: &Repository,
    tag_name: &str,
    body: Option<String>,
    generate_notes: Option<bool>,
) -> ApiResult<String> {
    if let Some(body) = body {
        return Ok(body);
    }
    if generate_notes == Some(true) {
        return generate_release_notes(state, repo, tag_name).await;
    }
    Ok(String::new())
}

async fn generate_release_notes(
    state: &AppState,
    repo: &Repository,
    tag_name: &str,
) -> ApiResult<String> {
    let previous_tag: Option<String> = sqlx::query_scalar(
        r#"
        SELECT tag_name
        FROM releases
        WHERE repository_id = $1 AND status = 'published' AND tag_name != $2
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT 1
        "#,
    )
    .bind(repo.id)
    .bind(tag_name)
    .fetch_optional(&state.pool)
    .await?;
    let target = if let Some(previous_tag) = previous_tag {
        format!("refs/tags/{previous_tag}..refs/tags/{tag_name}")
    } else {
        format!("refs/tags/{tag_name}")
    };
    let output = run_git_command(
        repo,
        &[
            "log".to_string(),
            "--max-count=50".to_string(),
            "--pretty=format:%s".to_string(),
            target,
        ],
    )
    .await?;
    let lines = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| format!("- {line}"))
        .collect::<Vec<_>>();
    if lines.is_empty() {
        Ok("## Changes\n\nNo commits found for this release.".to_string())
    } else {
        Ok(format!("## Changes\n\n{}", lines.join("\n")))
    }
}

fn new_activity_id(state: &AppState) -> String {
    format!(
        "{}/activities/{}",
        state.config.app_base_url.trim_end_matches('/'),
        Uuid::now_v7()
    )
}

fn comment_attachment_response(
    app_base_url: &str,
    repo: &Repository,
    attachment: CommentAttachment,
) -> CommentAttachmentResponse {
    let url = format!(
        "{}/repos/{}/{}/comment-attachments/{}/{}",
        app_base_url.trim_end_matches('/'),
        url_path_segment(&repo.owner_handle),
        url_path_segment(&repo.name),
        attachment.id,
        url_path_segment(&attachment.original_filename)
    );
    let is_image = attachment_is_inline_image(&attachment.content_type);
    let markdown = if is_image {
        format!("![{}]({})", attachment.original_filename, url)
    } else {
        format!("[{}]({})", attachment.original_filename, url)
    };
    CommentAttachmentResponse {
        id: attachment.id,
        filename: attachment.original_filename,
        content_type: attachment.content_type,
        size: attachment.byte_size,
        url,
        markdown,
        is_image,
        created_at: attachment.created_at,
    }
}

fn comment_attachment_storage_path(state: &AppState, storage_key: &str) -> PathBuf {
    state.config.attachment_storage_path.join(storage_key)
}

fn sanitize_attachment_filename(value: &str) -> String {
    let name = FsPath::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment")
        .trim();
    let sanitized = name
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_' | ' ') {
                char
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if sanitized.is_empty() {
        "attachment".to_string()
    } else {
        sanitized.chars().take(120).collect()
    }
}

fn header_safe_filename(value: &str) -> String {
    value
        .chars()
        .map(|char| {
            if char == '"' || char == '\\' || char.is_control() {
                '_'
            } else {
                char
            }
        })
        .collect()
}

fn attachment_is_inline_image(content_type: &str) -> bool {
    matches!(
        content_type.split(';').next().unwrap_or("").trim(),
        "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    )
}

fn url_path_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
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

async fn pull_request_count(
    state: &AppState,
    repository_id: Uuid,
    status: Option<&str>,
    search: Option<&str>,
    labels: &[String],
) -> ApiResult<i64> {
    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM pull_requests
        WHERE target_repository_id = $1
          AND ($2::TEXT IS NULL OR status = $2)
          AND ($3::TEXT IS NULL OR title ILIKE $3 OR body ILIKE $3)
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($4::TEXT[]) AS requested_label(name)
            WHERE NOT EXISTS (
              SELECT 1
              FROM pull_request_label_assignments
              JOIN issue_labels ON issue_labels.id = pull_request_label_assignments.label_id
              WHERE pull_request_label_assignments.pull_request_id = pull_requests.id
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

async fn replace_pull_request_labels(
    state: &AppState,
    repository_id: Uuid,
    pull_request_id: i64,
    labels: &[String],
) -> ApiResult<()> {
    sqlx::query("DELETE FROM pull_request_label_assignments WHERE pull_request_id = $1")
        .bind(pull_request_id)
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
            "INSERT INTO pull_request_label_assignments (pull_request_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(pull_request_id)
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

fn repo_cache_path_key(path: Option<&str>) -> String {
    match path {
        Some(path) => format!("{:x}", Sha256::digest(path.as_bytes())),
        None => "root".to_string(),
    }
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
    id: i64,
) -> ApiResult<PullRequest> {
    Ok(sqlx::query_as::<_, PullRequest>(
        r#"
        SELECT pull_requests.*,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', issue_labels.id, 'name', issue_labels.name, 'color', issue_labels.color) ORDER BY issue_labels.name)
            FROM pull_request_label_assignments
            JOIN issue_labels ON issue_labels.id = pull_request_label_assignments.label_id
            WHERE pull_request_label_assignments.pull_request_id = pull_requests.id
          ), '[]'::jsonb) AS labels
        FROM pull_requests
        WHERE target_repository_id = $1 AND id = $2
        "#,
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
        labels: pr.labels,
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

fn normalize_pull_request_list_status_filter(status: Option<&str>) -> ApiResult<Option<String>> {
    match status
        .map(str::trim)
        .filter(|status| !status.is_empty())
    {
        None | Some("all") => Ok(None),
        Some("open") => Ok(Some("open".to_string())),
        Some("close") | Some("closed") => Ok(Some("closed".to_string())),
        Some("merged") => Ok(Some("merged".to_string())),
        Some(_) => Err(ApiError::BadRequest(
            "invalid pull request status".to_string(),
        )),
    }
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

async fn deliver_release_activity(
    state: &AppState,
    repo: &Repository,
    release: &Release,
    activity_type: &str,
) -> ApiResult<()> {
    let activity_id = release
        .activity_id
        .as_deref()
        .map(str::to_string)
        .unwrap_or_else(|| new_activity_id(state));
    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": activity_type,
        "actor": release.author_actor_url,
        "object": {
            "type": "Release",
            "id": release_activity_url(&state.config, repo, &release.tag_name),
            "target": repo_activity_url(&state.config, repo),
            "tagName": release.tag_name,
            "name": release.title,
            "content": release.body,
            "status": release.status,
            "prerelease": release.is_prerelease,
            "attributedTo": release.author_actor_url
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
    dispatch_release_webhooks(state, repo, release, activity_type).await?;
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

pub(crate) fn release_activity_url(
    config: &crate::config::Config,
    repo: &Repository,
    tag_name: &str,
) -> String {
    format!(
        "{}/{}/{}/releases/{}",
        config.app_base_url.trim_end_matches('/'),
        repo.owner_handle,
        repo.name,
        url_path_segment(tag_name)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_tag_validation_accepts_common_version_tags() {
        assert_eq!(validate_release_tag_name("v1.2.3").unwrap(), "v1.2.3");
        assert_eq!(
            validate_release_tag_name("release/2026.06").unwrap(),
            "release/2026.06"
        );
    }

    #[test]
    fn release_tag_validation_rejects_unsafe_refs() {
        for value in [
            "",
            "-v1",
            "/v1",
            "v1/",
            "release//v1",
            "v 1",
            "v1..v2",
            "v1@{2}",
        ] {
            assert!(validate_release_tag_name(value).is_err());
        }
    }

    #[test]
    fn release_status_validation_matches_supported_states() {
        assert_eq!(
            normalize_release_status(Some("draft")).unwrap(),
            Some("draft")
        );
        assert_eq!(
            normalize_release_status(Some("published")).unwrap(),
            Some("published")
        );
        assert!(normalize_release_status(Some("archived")).is_err());
        assert_eq!(normalize_release_status_filter(Some("all")).unwrap(), None);
    }

    #[test]
    fn release_target_ref_validation_requires_a_safe_ref() {
        assert_eq!(validate_release_target_ref(Some("main")).unwrap(), "main");
        assert_eq!(
            validate_release_target_ref(Some("refs/heads/release")).unwrap(),
            "refs/heads/release"
        );
        for value in [
            None,
            Some(""),
            Some("-main"),
            Some("main..next"),
            Some("main@{1}"),
        ] {
            assert!(validate_release_target_ref(value).is_err());
        }
    }

    #[test]
    fn compare_range_validation_requires_two_safe_tags() {
        assert_eq!(
            parse_compare_range("v1.0.0...v1.1.0").unwrap(),
            ("v1.0.0".to_string(), "v1.1.0".to_string())
        );
        assert!(parse_compare_range("v1.0.0").is_err());
        assert!(parse_compare_range("v1..0...v1.1").is_err());
    }
}
