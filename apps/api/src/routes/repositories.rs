use axum::{
    Json,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
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

pub(crate) async fn list_repos(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let cache_key = cache_key(&["repos", "list"]);
    if let Some(cached) = state.cache.get_json::<Value>(&cache_key).await {
        return Ok(Json(cached));
    }

    let repos =
        sqlx::query_as::<_, Repository>("SELECT * FROM repositories ORDER BY created_at DESC")
            .fetch_all(&state.pool)
            .await?;
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
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryResponse>> {
    let cache_key = cache_key(&["repo", &owner, &name, "detail"]);
    if let Some(cached) = state.cache.get_json::<RepositoryResponse>(&cache_key).await {
        return Ok(Json(cached));
    }

    let repo = find_repo(&state.pool, &owner, &name).await?;
    let response = repository_response(&state.pool, &state.config, repo).await?;
    state.cache.set_json(&cache_key, &response).await;
    Ok(Json(response))
}

pub(crate) async fn list_repo_tree(
    State(state): State<AppState>,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoTreeQuery>,
) -> ApiResult<Json<RepositoryTreeResponse>> {
    let ref_part = query.ref_name.as_deref().unwrap_or("default");
    let cache_key = cache_key(&["repo", &owner, &name, "tree", ref_part]);
    if let Some(cached) = state
        .cache
        .get_json::<RepositoryTreeResponse>(&cache_key)
        .await
    {
        return Ok(Json(cached));
    }

    let repo = find_repo(&state.pool, &owner, &name).await?;
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
        state.cache.set_json(&cache_key, &response).await;
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
    state.cache.set_json(&cache_key, &response).await;
    Ok(Json(response))
}

pub(crate) async fn get_repo_file(
    State(state): State<AppState>,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoFileQuery>,
) -> ApiResult<Json<RepositoryFileResponse>> {
    let ref_part = query.ref_name.as_deref().unwrap_or("default");
    let cache_key = cache_key(&["repo", &owner, &name, "file", &query.path, ref_part]);
    if let Some(cached) = state
        .cache
        .get_json::<RepositoryFileResponse>(&cache_key)
        .await
    {
        return Ok(Json(cached));
    }

    let repo = find_repo(&state.pool, &owner, &name).await?;
    let path = normalize_repo_file_path(&query.path)?;
    let response = repo_file_response(&repo, &path, query.ref_name.as_deref()).await?;
    state.cache.set_json(&cache_key, &response).await;
    Ok(Json(response))
}

pub(crate) async fn get_repo_raw_file(
    State(state): State<AppState>,
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<RepoFileQuery>,
) -> ApiResult<Response> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
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
    Path((owner, name)): Path<(String, String)>,
    Query(query): Query<CommitListQuery>,
) -> ApiResult<Json<RepositoryCommitListResponse>> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    let commits = list_commits(&repo, query.ref_name.as_deref(), query.limit.unwrap_or(50)).await?;
    Ok(Json(RepositoryCommitListResponse { data: commits }))
}

pub(crate) async fn get_commit_route(
    State(state): State<AppState>,
    Path((owner, name, sha)): Path<(String, String, String)>,
) -> ApiResult<Json<RepositoryCommitDetailResponse>> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    Ok(Json(commit_detail(&repo, &sha).await?))
}

pub(crate) async fn compare_upstream(
    State(state): State<AppState>,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryCompareResponse>> {
    let repo = find_repo(&state.pool, &owner, &name).await?;
    Ok(Json(compare_repo_upstream(&state, &repo).await?))
}

pub(crate) async fn sync_upstream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<RepositoryCompareResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    resolve_writable_namespace(&state.pool, &auth, &repo.owner_handle).await?;

    let (source, upstream_url, upstream_branch) = upstream_target(&state, &repo).await?.ok_or_else(|| {
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
            message: Some("This repository is not a fork or its upstream could not be resolved.".to_string()),
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
        let source: Option<Repository> =
            sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
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
    let path = normalize_repo_file_path(&query.path)?;
    commit_repo_file_change(
        &repo,
        &auth,
        &path,
        RepoFileChange::Delete,
        format!("Delete {}", repo_path_name(&path)),
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
        if let Some(remote_url) = source.source_remote_url.as_deref().or(source.remote_url.as_deref()) {
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
    .bind(input.source_repo_url)
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
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let target = find_repo(&state.pool, &owner, &name).await?;
    let prs = sqlx::query_as::<_, PullRequest>(
        "SELECT * FROM pull_requests WHERE target_repository_id = $1 ORDER BY created_at DESC",
    )
    .bind(target.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "data": prs })))
}
