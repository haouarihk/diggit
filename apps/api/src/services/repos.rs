use super::*;

pub(crate) async fn owner_repositories(
    state: &AppState,
    owner: &str,
    query: RepoListQuery,
    auth: Option<&AuthUser>,
) -> ApiResult<Vec<RepositoryResponse>> {
    let auth_cache_key = auth
        .map(|auth| auth.id.to_string())
        .unwrap_or_else(|| "public".to_string());
    let cache_key = cache_key(&[
        "repos",
        "owner",
        owner,
        &auth_cache_key,
        query.q.as_deref().unwrap_or(""),
        query.sort.as_deref().unwrap_or("updated"),
        query.direction.as_deref().unwrap_or("desc"),
    ]);
    if let Some(cached) = state
        .cache
        .get_json::<Vec<RepositoryResponse>>(&cache_key)
        .await
    {
        return Ok(cached);
    }

    let mut repos = sqlx::query_as::<_, Repository>(
        "SELECT * FROM repositories WHERE owner_handle = $1 ORDER BY updated_at DESC",
    )
    .bind(owner)
    .fetch_all(&state.pool)
    .await?;
    repos.retain(|repo| repo.visibility == "public");

    if let Some(auth) = auth {
        let can_read_private = resolve_writable_namespace(&state.pool, auth, owner)
            .await
            .is_ok();
        if can_read_private {
            repos = sqlx::query_as::<_, Repository>(
                "SELECT * FROM repositories WHERE owner_handle = $1 ORDER BY updated_at DESC",
            )
            .bind(owner)
            .fetch_all(&state.pool)
            .await?;
        }
    }

    if let Some(query) = query.q.map(|query| query.trim().to_ascii_lowercase()) {
        if !query.is_empty() {
            repos.retain(|repo| {
                [
                    repo.owner_handle.as_str(),
                    repo.name.as_str(),
                    repo.description.as_str(),
                    repo.visibility.as_str(),
                    repo.dominant_language.as_str(),
                    repo.remote_server.as_deref().unwrap_or(""),
                ]
                .join(" ")
                .to_ascii_lowercase()
                .contains(&query)
            });
        }
    }

    match query.sort.as_deref().unwrap_or("updated") {
        "stars" => repos.sort_by(|a, b| b.stars_count.cmp(&a.stars_count)),
        "name" => repos.sort_by(|a, b| a.name.cmp(&b.name)),
        _ => repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at)),
    }
    if query.direction.as_deref() == Some("asc") {
        repos.reverse();
    }

    let mut responses = Vec::with_capacity(repos.len());
    for repo in repos {
        responses.push(repository_response_for_auth(&state.pool, &state.config, repo, auth).await?);
    }

    state.cache.set_json(&cache_key, &responses).await;
    Ok(responses)
}

pub(crate) async fn ensure_namespace_available(pool: &PgPool, name: &str) -> ApiResult<()> {
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM namespaces WHERE name = $1")
        .bind(name)
        .fetch_optional(pool)
        .await?;
    if exists.is_some() {
        return Err(ApiError::BadRequest(
            "owner name is already taken".to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn resolve_writable_namespace(
    pool: &PgPool,
    auth: &AuthUser,
    owner: &str,
) -> ApiResult<Namespace> {
    let owner = normalize_name(owner)?;
    let namespace = sqlx::query_as::<_, Namespace>("SELECT * FROM namespaces WHERE name = $1")
        .bind(&owner)
        .fetch_one(pool)
        .await?;

    match namespace.kind.as_str() {
        "user" if namespace.user_id == Some(auth.id) => Ok(namespace),
        "organization" => {
            let membership: Option<(String,)> = sqlx::query_as(
                r#"
                SELECT role
                FROM organization_members
                WHERE organization_id = $1 AND user_id = $2
                "#,
            )
            .bind(namespace.organization_id)
            .bind(auth.id)
            .fetch_optional(pool)
            .await?;

            if membership.is_some() {
                Ok(namespace)
            } else {
                Err(ApiError::Unauthorized)
            }
        }
        _ => Err(ApiError::Unauthorized),
    }
}

pub(crate) async fn ensure_repo_admin(
    pool: &PgPool,
    auth: &AuthUser,
    repo: &Repository,
) -> ApiResult<()> {
    let namespace = sqlx::query_as::<_, Namespace>("SELECT * FROM namespaces WHERE name = $1")
        .bind(&repo.owner_handle)
        .fetch_one(pool)
        .await?;

    match namespace.kind.as_str() {
        "user" if namespace.user_id == Some(auth.id) => Ok(()),
        "organization" => {
            let organization_id = namespace.organization_id.ok_or(ApiError::Unauthorized)?;
            ensure_org_admin(pool, organization_id, auth.id).await
        }
        _ => Err(ApiError::Unauthorized),
    }
}

pub(crate) async fn find_repo(pool: &PgPool, owner: &str, name: &str) -> ApiResult<Repository> {
    Ok(sqlx::query_as::<_, Repository>(
        "SELECT * FROM repositories WHERE owner_handle = $1 AND name = $2",
    )
    .bind(normalize_name(owner)?)
    .bind(name)
    .fetch_one(pool)
    .await?)
}

pub(crate) async fn ensure_repo_visible(
    pool: &PgPool,
    auth: Option<&AuthUser>,
    repo: &Repository,
) -> ApiResult<()> {
    if repo.visibility == "public" {
        return Ok(());
    }

    let Some(auth) = auth else {
        return Err(ApiError::NotFound);
    };

    if resolve_writable_namespace(pool, auth, &repo.owner_handle)
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
    .fetch_optional(pool)
    .await?;
    if collaborator.is_some() {
        Ok(())
    } else {
        Err(ApiError::NotFound)
    }
}

pub(crate) async fn ensure_repo_action_visible(
    pool: &PgPool,
    auth: &RepoActionAuth,
    repo: &Repository,
) -> ApiResult<()> {
    match auth {
        RepoActionAuth::Local(auth) => ensure_repo_visible(pool, Some(auth), repo).await,
        RepoActionAuth::Federated(_) => ensure_repo_visible(pool, None, repo).await,
    }
}

pub(crate) async fn public_repositories(pool: &PgPool) -> ApiResult<Vec<Repository>> {
    Ok(sqlx::query_as::<_, Repository>(
        "SELECT * FROM repositories WHERE visibility = 'public' ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub(crate) async fn sync_repo_stars(pool: &PgPool, repo_id: Uuid) -> ApiResult<Repository> {
    Ok(sqlx::query_as::<_, Repository>(
        r#"
        UPDATE repositories
        SET stars_count = (
          SELECT (
            (SELECT COUNT(*) FROM repository_stars WHERE repository_id = $1) +
            (SELECT COUNT(*) FROM repository_remote_stars WHERE repository_id = $1)
          )::INTEGER
        )
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(repo_id)
    .fetch_one(pool)
    .await?)
}

pub(crate) async fn find_repo_by_activity_url(
    pool: &PgPool,
    url: &str,
) -> ApiResult<Option<Repository>> {
    let stored = sqlx::query_as::<_, Repository>(
        "SELECT * FROM repositories WHERE remote_url = $1 OR source_remote_url = $1",
    )
    .bind(url)
    .fetch_optional(pool)
    .await?;

    if stored.is_some() {
        return Ok(stored);
    }

    let segments: Vec<&str> = url
        .trim_end_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() >= 2 {
        let owner = segments[segments.len() - 2];
        let name = segments[segments.len() - 1];
        return Ok(find_repo(pool, owner, name).await.ok());
    }

    Ok(None)
}

pub(crate) async fn repository_source_response(
    pool: &PgPool,
    config: &Config,
    repo: &Repository,
) -> ApiResult<Option<RepositorySourceResponse>> {
    if let Some(source_id) = repo.source_repository_id {
        let source: Option<Repository> = sqlx::query_as("SELECT * FROM repositories WHERE id = $1")
            .bind(source_id)
            .fetch_optional(pool)
            .await?;
        if let Some(source) = source {
            return Ok(Some(RepositorySourceResponse {
                owner_handle: source.owner_handle.clone(),
                name: source.name.clone(),
                url: repo_activity_url(config, &source),
                kind: "local".to_string(),
            }));
        }
    }

    Ok(repo.source_remote_url.as_ref().map(|url| {
        let name = url
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("repository")
            .trim_end_matches(".git")
            .to_string();
        RepositorySourceResponse {
            owner_handle: repo
                .remote_server
                .clone()
                .unwrap_or_else(|| "remote".to_string()),
            name,
            url: url.clone(),
            kind: "remote".to_string(),
        }
    }))
}

pub(crate) fn cache_key(parts: &[&str]) -> String {
    let segments = parts
        .iter()
        .map(|part| {
            part.chars()
                .map(|char| {
                    if char.is_ascii_alphanumeric() || char == '-' || char == '_' || char == '*' {
                        char
                    } else {
                        '_'
                    }
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join(":");
    format!("diggit:{}", segments)
}

pub(crate) async fn invalidate_repo_cache(state: &AppState, owner: &str, name: &str) {
    state
        .cache
        .delete_pattern(&cache_key(&["repos", "*"]))
        .await;
    state
        .cache
        .delete_pattern(&cache_key(&["repo", owner, name, "*"]))
        .await;
    state
        .cache
        .delete_pattern(&cache_key(&["social", "repo", owner, name, "*"]))
        .await;
}

pub(crate) async fn repository_owner_response(
    pool: &PgPool,
    repo: &Repository,
) -> ApiResult<RepositoryOwnerResponse> {
    let owner: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
        r#"
        SELECT namespaces.kind, users.display_name, users.avatar_url
        FROM namespaces
        JOIN users ON users.id = namespaces.user_id
        WHERE namespaces.name = $1 AND namespaces.kind = 'user'
        UNION ALL
        SELECT namespaces.kind, organizations.display_name, NULL::TEXT AS avatar_url
        FROM namespaces
        JOIN organizations ON organizations.id = namespaces.organization_id
        WHERE namespaces.name = $1 AND namespaces.kind = 'organization'
        LIMIT 1
        "#,
    )
    .bind(&repo.owner_handle)
    .fetch_optional(pool)
    .await?;

    let (kind, display_name, avatar_url) = owner
        .map(|(kind, display_name, avatar_url)| {
            (
                kind,
                display_name.unwrap_or_else(|| repo.owner_handle.clone()),
                avatar_url,
            )
        })
        .unwrap_or_else(|| ("remote".to_string(), repo.owner_handle.clone(), None));

    Ok(RepositoryOwnerResponse {
        handle: repo.owner_handle.clone(),
        avatar_fallback: avatar_fallback(&display_name),
        display_name,
        avatar_url,
        kind,
    })
}

pub(crate) async fn repository_response(
    pool: &PgPool,
    config: &Config,
    repo: Repository,
) -> ApiResult<RepositoryResponse> {
    let owner = repository_owner_response(pool, &repo).await?;
    let forks_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM repositories WHERE source_repository_id = $1")
            .bind(repo.id)
            .fetch_one(pool)
            .await?;
    let ssh_public_host = config.public_api_host();
    let ssh_url = if config.ssh_port == 22 {
        format!(
            "git@{}:{}/{}.git",
            ssh_public_host, repo.owner_handle, repo.name
        )
    } else {
        format!(
            "ssh://git@{}:{}/{}/{}.git",
            ssh_public_host, config.ssh_port, repo.owner_handle, repo.name
        )
    };
    let http_url = format!(
        "{}/{}/{}.git",
        config.public_web_url.trim_end_matches('/'),
        repo.owner_handle,
        repo.name
    );
    let source_repository = repository_source_response(pool, config, &repo).await?;
    let source_url = source_repository.as_ref().map(|source| source.url.clone());

    Ok(RepositoryResponse {
        id: repo.id,
        namespace_id: repo.namespace_id,
        owner_id: repo.owner_id,
        owner_handle: repo.owner_handle,
        owner,
        name: repo.name,
        description: repo.description,
        visibility: repo.visibility,
        default_branch: repo.default_branch,
        issues_enabled: repo.issues_enabled,
        pull_requests_enabled: repo.pull_requests_enabled,
        pull_request_policy: repo.pull_request_policy,
        archived_at: repo.archived_at,
        dominant_language: repo.dominant_language,
        stars_count: repo.stars_count,
        viewer_has_starred: false,
        forks_count,
        local_path: repo.local_path,
        remote_url: repo.remote_url,
        remote_server: repo.remote_server,
        source_repository_id: repo.source_repository_id,
        source_remote_url: repo.source_remote_url,
        source_url,
        source_repository,
        ssh_url,
        http_url,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
    })
}

pub(crate) async fn repository_response_for_auth(
    pool: &PgPool,
    config: &Config,
    repo: Repository,
    auth: Option<&AuthUser>,
) -> ApiResult<RepositoryResponse> {
    let viewer_has_starred = if let Some(auth) = auth {
        viewer_has_starred(pool, repo.id, auth.id).await?
    } else {
        false
    };
    let mut response = repository_response(pool, config, repo).await?;
    response.viewer_has_starred = viewer_has_starred;
    Ok(response)
}

pub(crate) async fn viewer_has_starred(
    pool: &PgPool,
    repo_id: Uuid,
    user_id: Uuid,
) -> ApiResult<bool> {
    let starred: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM repository_stars WHERE repository_id = $1 AND user_id = $2",
    )
    .bind(repo_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(starred.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo_with_visibility(visibility: &str) -> Repository {
        Repository {
            id: Uuid::now_v7(),
            namespace_id: None,
            owner_id: None,
            owner_handle: "alice".to_string(),
            name: "demo".to_string(),
            description: String::new(),
            visibility: visibility.to_string(),
            default_branch: "main".to_string(),
            issues_enabled: true,
            pull_requests_enabled: true,
            pull_request_policy: "anyone".to_string(),
            archived_at: None,
            dominant_language: String::new(),
            stars_count: 0,
            local_path: String::new(),
            remote_url: None,
            remote_server: None,
            source_repository_id: None,
            source_remote_url: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn public_repositories_are_visible_without_auth() {
        let pool = PgPool::connect_lazy("postgres://diggit:diggit@localhost/diggit").unwrap();
        assert!(
            ensure_repo_visible(&pool, None, &repo_with_visibility("public"))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn private_repositories_are_hidden_without_auth() {
        let pool = PgPool::connect_lazy("postgres://diggit:diggit@localhost/diggit").unwrap();
        assert!(matches!(
            ensure_repo_visible(&pool, None, &repo_with_visibility("private")).await,
            Err(ApiError::NotFound)
        ));
    }
}
