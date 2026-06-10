use super::*;
use bcrypt::{DEFAULT_COST, hash, verify};

const OAUTH_ACCESS_TOKEN_TTL_HOURS: i64 = 2;
const OAUTH_CODE_TTL_MINUTES: i64 = 10;
const ALLOWED_OAUTH_SCOPES: &[&str] = &["api", "read_user", "read_repository"];
const WEBHOOK_DELIVERY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

#[derive(Debug, Clone)]
pub(crate) struct OAuthTokenAuth {
    pub(crate) user: AuthUser,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct GitBranchTip {
    pub(crate) name: String,
    pub(crate) sha: String,
}

pub(crate) fn oauth_application_response(
    application: OAuthApplication,
) -> OAuthApplicationResponse {
    OAuthApplicationResponse {
        id: application.id,
        client_id: application.id.to_string(),
        name: application.name,
        redirect_uri: application.redirect_uri,
        scopes: application.scopes,
        created_at: application.created_at,
        updated_at: application.updated_at,
    }
}

pub(crate) fn repository_webhook_response(webhook: RepositoryWebhook) -> RepositoryWebhookResponse {
    RepositoryWebhookResponse {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        last_status: webhook.last_status,
        last_status_code: webhook.last_status_code,
        last_error: webhook.last_error,
        last_delivered_at: webhook.last_delivered_at,
        created_at: webhook.created_at,
        updated_at: webhook.updated_at,
    }
}

pub(crate) async fn create_oauth_application(
    state: &AppState,
    auth: &AuthUser,
    input: CreateOAuthApplicationRequest,
) -> ApiResult<CreatedOAuthApplicationResponse> {
    let redirect_uri = validate_remote_url(&input.redirect_uri)?.to_string();
    let scopes = normalize_oauth_scopes(input.scopes.unwrap_or_else(default_oauth_scopes))?;
    let client_secret = generate_oauth_secret("dgcs");
    let secret_hash = hash(&client_secret, DEFAULT_COST)?;
    let application = sqlx::query_as::<_, OAuthApplication>(
        r#"
        INSERT INTO oauth_applications (id, owner_id, name, redirect_uri, scopes, client_secret_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(auth.id)
    .bind(input.name.trim())
    .bind(redirect_uri)
    .bind(scopes)
    .bind(secret_hash)
    .fetch_one(&state.pool)
    .await?;

    Ok(CreatedOAuthApplicationResponse {
        application: oauth_application_response(application),
        client_secret,
    })
}

pub(crate) async fn list_oauth_applications(
    state: &AppState,
    auth: &AuthUser,
) -> ApiResult<Vec<OAuthApplicationResponse>> {
    let applications = sqlx::query_as::<_, OAuthApplication>(
        r#"
        SELECT *
        FROM oauth_applications
        WHERE owner_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC
        "#,
    )
    .bind(auth.id)
    .fetch_all(&state.pool)
    .await?;

    Ok(applications
        .into_iter()
        .map(oauth_application_response)
        .collect())
}

pub(crate) async fn update_oauth_application(
    state: &AppState,
    auth: &AuthUser,
    id: Uuid,
    input: UpdateOAuthApplicationRequest,
) -> ApiResult<OAuthApplicationResponse> {
    let current = find_owned_oauth_application(state, auth, id).await?;
    let redirect_uri = match input.redirect_uri {
        Some(value) => validate_remote_url(&value)?.to_string(),
        None => current.redirect_uri,
    };
    let scopes = match input.scopes {
        Some(scopes) => normalize_oauth_scopes(scopes)?,
        None => current.scopes,
    };
    let name = input.name.unwrap_or(current.name);
    let application = sqlx::query_as::<_, OAuthApplication>(
        r#"
        UPDATE oauth_applications
        SET name = $2, redirect_uri = $3, scopes = $4, updated_at = now()
        WHERE id = $1 AND owner_id = $5 AND revoked_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(name.trim())
    .bind(redirect_uri)
    .bind(scopes)
    .bind(auth.id)
    .fetch_one(&state.pool)
    .await?;

    Ok(oauth_application_response(application))
}

pub(crate) async fn rotate_oauth_application_secret(
    state: &AppState,
    auth: &AuthUser,
    id: Uuid,
) -> ApiResult<RotatedOAuthApplicationSecretResponse> {
    find_owned_oauth_application(state, auth, id).await?;
    let client_secret = generate_oauth_secret("dgcs");
    let secret_hash = hash(&client_secret, DEFAULT_COST)?;
    let application = sqlx::query_as::<_, OAuthApplication>(
        r#"
        UPDATE oauth_applications
        SET client_secret_hash = $2, updated_at = now()
        WHERE id = $1 AND owner_id = $3 AND revoked_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(secret_hash)
    .bind(auth.id)
    .fetch_one(&state.pool)
    .await?;

    Ok(RotatedOAuthApplicationSecretResponse {
        application: oauth_application_response(application),
        client_secret,
    })
}

pub(crate) async fn delete_oauth_application(
    state: &AppState,
    auth: &AuthUser,
    id: Uuid,
) -> ApiResult<()> {
    let result = sqlx::query(
        r#"
        UPDATE oauth_applications
        SET revoked_at = now(), updated_at = now()
        WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL
        "#,
    )
    .bind(id)
    .bind(auth.id)
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }

    sqlx::query("UPDATE oauth_access_tokens SET revoked_at = now() WHERE application_id = $1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

pub(crate) async fn list_oauth_tokens(
    state: &AppState,
    auth: &AuthUser,
) -> ApiResult<Vec<OAuthTokenResponse>> {
    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            String,
            Vec<String>,
            DateTime<Utc>,
            Option<DateTime<Utc>>,
            Option<DateTime<Utc>>,
            DateTime<Utc>,
        ),
    >(
        r#"
        SELECT oauth_access_tokens.id,
               oauth_access_tokens.application_id,
               oauth_applications.name,
               oauth_access_tokens.scopes,
               oauth_access_tokens.expires_at,
               oauth_access_tokens.revoked_at,
               oauth_access_tokens.last_used_at,
               oauth_access_tokens.created_at
        FROM oauth_access_tokens
        JOIN oauth_applications ON oauth_applications.id = oauth_access_tokens.application_id
        WHERE oauth_access_tokens.user_id = $1
        ORDER BY oauth_access_tokens.created_at DESC
        "#,
    )
    .bind(auth.id)
    .fetch_all(&state.pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                application_id,
                application_name,
                scopes,
                expires_at,
                revoked_at,
                last_used_at,
                created_at,
            )| OAuthTokenResponse {
                id,
                application_id,
                application_name,
                scopes,
                expires_at,
                revoked_at,
                last_used_at,
                created_at,
            },
        )
        .collect())
}

pub(crate) async fn revoke_oauth_token(
    state: &AppState,
    auth: &AuthUser,
    id: Uuid,
) -> ApiResult<()> {
    let result = sqlx::query(
        "UPDATE oauth_access_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(auth.id)
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(())
}

pub(crate) async fn create_oauth_authorization_code(
    state: &AppState,
    user: &User,
    client_id: &str,
    redirect_uri: &str,
    requested_scope: Option<&str>,
) -> ApiResult<String> {
    let application = find_oauth_application_by_client_id(state, client_id).await?;
    if !oauth_redirect_uri_matches(&application.redirect_uri, redirect_uri)? {
        return Err(ApiError::Unauthorized);
    }
    let requested_scopes = scope_string_to_vec(requested_scope.unwrap_or("api"));
    let scopes = normalize_oauth_scopes(requested_scopes)?;
    ensure_scopes_allowed_by_application(&scopes, &application.scopes)?;
    let code = generate_oauth_secret("dgcode");
    let expires_at = Utc::now() + Duration::minutes(OAUTH_CODE_TTL_MINUTES);
    sqlx::query(
        r#"
        INSERT INTO oauth_authorization_codes
          (code_hash, application_id, user_id, redirect_uri, scopes, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(oauth_secret_hash(&code))
    .bind(application.id)
    .bind(user.id)
    .bind(redirect_uri)
    .bind(scopes)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;
    Ok(code)
}

pub(crate) fn oauth_redirect_uri_matches(registered: &str, provided: &str) -> ApiResult<bool> {
    if registered == provided {
        return Ok(true);
    }
    let registered = validate_remote_url(registered)?;
    let provided = validate_remote_url(provided)?;
    let same_origin_and_path = registered.scheme() == provided.scheme()
        && registered.host_str() == provided.host_str()
        && registered.port_or_known_default() == provided.port_or_known_default()
        && registered.path() == provided.path();
    if !same_origin_and_path {
        return Ok(false);
    }
    Ok(match registered.query() {
        Some(query) => provided.query() == Some(query),
        None => true,
    })
}

pub(crate) async fn exchange_oauth_token(
    state: &AppState,
    input: OAuthTokenRequest,
) -> ApiResult<OAuthTokenIssueResponse> {
    let application = find_oauth_application_by_client_id(state, &input.client_id).await?;
    verify_oauth_client_secret(&application, &input.client_secret)?;

    match input.grant_type.as_str() {
        "authorization_code" => {
            let code = input.code.ok_or(ApiError::Unauthorized)?;
            let redirect_uri = input.redirect_uri.ok_or(ApiError::Unauthorized)?;
            exchange_authorization_code(state, application, &code, &redirect_uri).await
        }
        "refresh_token" => {
            let refresh_token = input.refresh_token.ok_or(ApiError::Unauthorized)?;
            refresh_access_token(state, application, &refresh_token).await
        }
        _ => Err(ApiError::BadRequest("unsupported grant_type".to_string())),
    }
}

pub(crate) async fn require_oauth_access(
    state: &AppState,
    headers: &HeaderMap,
    required_scope: &str,
) -> ApiResult<OAuthTokenAuth> {
    let token = oauth_access_token_from_headers(headers).ok_or(ApiError::Unauthorized)?;
    let token_hash = oauth_secret_hash(&token);
    let row: (
        Uuid,
        Uuid,
        String,
        Vec<String>,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
    ) = sqlx::query_as(
        r#"
        SELECT oauth_access_tokens.id,
               users.id,
               users.username,
               oauth_access_tokens.scopes,
               oauth_access_tokens.expires_at,
               oauth_access_tokens.revoked_at
        FROM oauth_access_tokens
        JOIN users ON users.id = oauth_access_tokens.user_id
        JOIN oauth_applications ON oauth_applications.id = oauth_access_tokens.application_id
        WHERE oauth_access_tokens.access_token_hash = $1
          AND oauth_applications.revoked_at IS NULL
        "#,
    )
    .bind(token_hash)
    .fetch_one(&state.pool)
    .await?;

    if row.5.is_some() || row.4 < Utc::now() {
        return Err(ApiError::Unauthorized);
    }
    if !oauth_scope_allows(&row.3, required_scope) {
        return Err(ApiError::Unauthorized);
    }

    sqlx::query("UPDATE oauth_access_tokens SET last_used_at = now() WHERE id = $1")
        .bind(row.0)
        .execute(&state.pool)
        .await?;

    Ok(OAuthTokenAuth {
        user: AuthUser {
            id: row.1,
            username: row.2,
        },
    })
}

pub(crate) async fn oauth_accessible_repositories(
    state: &AppState,
    auth: &OAuthTokenAuth,
) -> ApiResult<Vec<Repository>> {
    Ok(sqlx::query_as::<_, Repository>(
        r#"
        SELECT DISTINCT repositories.*
        FROM repositories
        LEFT JOIN namespaces ON namespaces.name = repositories.owner_handle
        LEFT JOIN organization_members
          ON organization_members.organization_id = namespaces.organization_id
        LEFT JOIN repository_collaborators
          ON repository_collaborators.repository_id = repositories.id
        WHERE repositories.owner_id = $1
           OR namespaces.user_id = $1
           OR organization_members.user_id = $1
           OR repository_collaborators.user_id = $1
        ORDER BY repositories.updated_at DESC
        "#,
    )
    .bind(auth.user.id)
    .fetch_all(&state.pool)
    .await?)
}

pub(crate) async fn ensure_gitlab_project_id(
    state: &AppState,
    repository_id: Uuid,
) -> ApiResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO gitlab_project_mappings (repository_id)
        VALUES ($1)
        ON CONFLICT (repository_id) DO UPDATE
        SET repository_id = EXCLUDED.repository_id
        RETURNING gitlab_project_id
        "#,
    )
    .bind(repository_id)
    .fetch_one(&state.pool)
    .await?)
}

pub(crate) async fn repository_by_gitlab_project_id(
    state: &AppState,
    project_id: i64,
) -> ApiResult<Repository> {
    Ok(sqlx::query_as::<_, Repository>(
        r#"
        SELECT repositories.*
        FROM gitlab_project_mappings
        JOIN repositories ON repositories.id = gitlab_project_mappings.repository_id
        WHERE gitlab_project_mappings.gitlab_project_id = $1
        "#,
    )
    .bind(project_id)
    .fetch_one(&state.pool)
    .await?)
}

pub(crate) async fn repository_by_gitlab_project_ref(
    state: &AppState,
    project_ref: &str,
) -> ApiResult<Repository> {
    if let Ok(project_id) = project_ref.parse::<i64>() {
        return repository_by_gitlab_project_id(state, project_id).await;
    }

    let project_ref = percent_decode_project_ref(project_ref)?;
    let Some((owner, name)) = project_ref.split_once('/') else {
        return Err(ApiError::NotFound);
    };
    if owner.is_empty() || name.is_empty() || name.contains('/') {
        return Err(ApiError::NotFound);
    }

    find_repo(&state.pool, owner, name).await
}

fn percent_decode_project_ref(value: &str) -> ApiResult<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(ApiError::NotFound);
            }
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| ApiError::NotFound)?;
            let byte = u8::from_str_radix(hex, 16).map_err(|_| ApiError::NotFound)?;
            decoded.push(byte);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| ApiError::NotFound)
}

pub(crate) async fn ensure_oauth_repo_visible(
    state: &AppState,
    auth: &OAuthTokenAuth,
    repo: &Repository,
) -> ApiResult<()> {
    ensure_repo_visible(&state.pool, Some(&auth.user), repo).await
}

pub(crate) async fn create_repository_webhook(
    state: &AppState,
    auth: &AuthUser,
    repo: &Repository,
    input: CreateRepositoryWebhookRequest,
) -> ApiResult<RepositoryWebhookResponse> {
    ensure_repo_admin(&state.pool, auth, repo).await?;
    let url = validate_remote_url(&input.url)?.to_string();
    let events =
        normalize_webhook_events(input.events.unwrap_or_else(|| vec!["push".to_string()]))?;
    let webhook = sqlx::query_as::<_, RepositoryWebhook>(
        r#"
        INSERT INTO repository_webhooks (id, repository_id, url, secret, events)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(repo.id)
    .bind(url)
    .bind(input.secret.filter(|value| !value.trim().is_empty()))
    .bind(events)
    .fetch_one(&state.pool)
    .await?;
    Ok(repository_webhook_response(webhook))
}

pub(crate) async fn list_gitlab_project_hooks(
    state: &AppState,
    auth: &OAuthTokenAuth,
    repo: &Repository,
) -> ApiResult<Vec<Value>> {
    ensure_repo_admin(&state.pool, &auth.user, repo).await?;
    let webhooks = sqlx::query_as::<_, RepositoryWebhook>(
        "SELECT * FROM repository_webhooks WHERE repository_id = $1 ORDER BY created_at DESC",
    )
    .bind(repo.id)
    .fetch_all(&state.pool)
    .await?;
    let project_id = ensure_gitlab_project_id(state, repo.id).await?;
    Ok(webhooks
        .into_iter()
        .map(|webhook| gitlab_project_hook_json(state, repo, project_id, webhook))
        .collect())
}

pub(crate) async fn create_gitlab_project_hook(
    state: &AppState,
    auth: &OAuthTokenAuth,
    repo: &Repository,
    input: CreateGitlabProjectHookRequest,
) -> ApiResult<Value> {
    ensure_repo_admin(&state.pool, &auth.user, repo).await?;
    let url = validate_remote_url(&input.url)?.to_string();
    let _enable_ssl_verification = input.enable_ssl_verification.unwrap_or(true);
    let branch_filter_strategy =
        normalize_gitlab_branch_filter_strategy(input.branch_filter_strategy);
    let push_events_branch_filter = normalize_gitlab_branch_filter(input.push_events_branch_filter);
    let events = if input.push_events.unwrap_or(true) {
        vec!["push".to_string()]
    } else {
        Vec::new()
    };
    let secret = input.token.filter(|value| !value.trim().is_empty());
    let active = input.active.unwrap_or(true);
    let existing_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM repository_webhooks WHERE repository_id = $1 AND url = $2 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(repo.id)
    .bind(&url)
    .fetch_optional(&state.pool)
    .await?;
    let webhook = if let Some(existing_id) = existing_id {
        sqlx::query_as::<_, RepositoryWebhook>(
            r#"
            UPDATE repository_webhooks
            SET secret = $3,
                events = $4,
                active = $5,
                push_events_branch_filter = $6,
                branch_filter_strategy = $7,
                updated_at = now()
            WHERE id = $1 AND repository_id = $2
            RETURNING *
            "#,
        )
        .bind(existing_id)
        .bind(repo.id)
        .bind(secret)
        .bind(events)
        .bind(active)
        .bind(&push_events_branch_filter)
        .bind(&branch_filter_strategy)
        .fetch_one(&state.pool)
        .await?
    } else {
        sqlx::query_as::<_, RepositoryWebhook>(
            r#"
            INSERT INTO repository_webhooks
              (id, repository_id, url, secret, events, active, push_events_branch_filter, branch_filter_strategy)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(repo.id)
        .bind(url)
        .bind(secret)
        .bind(events)
        .bind(active)
        .bind(&push_events_branch_filter)
        .bind(&branch_filter_strategy)
        .fetch_one(&state.pool)
        .await?
    };
    let project_id = ensure_gitlab_project_id(state, repo.id).await?;
    Ok(gitlab_project_hook_json(state, repo, project_id, webhook))
}

pub(crate) async fn update_gitlab_project_hook(
    state: &AppState,
    auth: &OAuthTokenAuth,
    repo: &Repository,
    hook_id: &str,
    input: CreateGitlabProjectHookRequest,
) -> ApiResult<Value> {
    ensure_repo_admin(&state.pool, &auth.user, repo).await?;
    let hook_id = Uuid::parse_str(hook_id).map_err(|_| ApiError::NotFound)?;
    let url = validate_remote_url(&input.url)?.to_string();
    let events = if input.push_events.unwrap_or(true) {
        vec!["push".to_string()]
    } else {
        Vec::new()
    };
    let branch_filter_strategy =
        normalize_gitlab_branch_filter_strategy(input.branch_filter_strategy);
    let push_events_branch_filter = normalize_gitlab_branch_filter(input.push_events_branch_filter);
    let webhook = sqlx::query_as::<_, RepositoryWebhook>(
        r#"
        UPDATE repository_webhooks
        SET url = $3,
            secret = $4,
            events = $5,
            active = $6,
            push_events_branch_filter = $7,
            branch_filter_strategy = $8,
            updated_at = now()
        WHERE id = $1 AND repository_id = $2
        RETURNING *
        "#,
    )
    .bind(hook_id)
    .bind(repo.id)
    .bind(url)
    .bind(input.token.filter(|value| !value.trim().is_empty()))
    .bind(events)
    .bind(input.active.unwrap_or(true))
    .bind(push_events_branch_filter)
    .bind(branch_filter_strategy)
    .fetch_one(&state.pool)
    .await?;
    let project_id = ensure_gitlab_project_id(state, repo.id).await?;
    Ok(gitlab_project_hook_json(state, repo, project_id, webhook))
}

pub(crate) async fn delete_gitlab_project_hook(
    state: &AppState,
    auth: &OAuthTokenAuth,
    repo: &Repository,
    hook_id: &str,
) -> ApiResult<()> {
    ensure_repo_admin(&state.pool, &auth.user, repo).await?;
    let hook_id = Uuid::parse_str(hook_id).map_err(|_| ApiError::NotFound)?;
    let result =
        sqlx::query("DELETE FROM repository_webhooks WHERE id = $1 AND repository_id = $2")
            .bind(hook_id)
            .bind(repo.id)
            .execute(&state.pool)
            .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(())
}

pub(crate) async fn test_gitlab_project_hook(
    state: &AppState,
    auth: &OAuthTokenAuth,
    repo: &Repository,
    hook_id: &str,
) -> ApiResult<()> {
    let hook_id = Uuid::parse_str(hook_id).map_err(|_| ApiError::NotFound)?;
    test_repository_webhook(state, &auth.user, repo, hook_id).await
}

pub(crate) async fn list_repository_webhooks(
    state: &AppState,
    auth: &AuthUser,
    repo: &Repository,
) -> ApiResult<Vec<RepositoryWebhookResponse>> {
    ensure_repo_admin(&state.pool, auth, repo).await?;
    let webhooks = sqlx::query_as::<_, RepositoryWebhook>(
        "SELECT * FROM repository_webhooks WHERE repository_id = $1 ORDER BY created_at DESC",
    )
    .bind(repo.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(webhooks
        .into_iter()
        .map(repository_webhook_response)
        .collect())
}

pub(crate) async fn delete_repository_webhook(
    state: &AppState,
    auth: &AuthUser,
    repo: &Repository,
    webhook_id: Uuid,
) -> ApiResult<()> {
    ensure_repo_admin(&state.pool, auth, repo).await?;
    let result =
        sqlx::query("DELETE FROM repository_webhooks WHERE id = $1 AND repository_id = $2")
            .bind(webhook_id)
            .bind(repo.id)
            .execute(&state.pool)
            .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(())
}

pub(crate) async fn dispatch_repository_webhooks(
    state: &AppState,
    repo: &Repository,
    auth: &AuthUser,
    before_tips: &[GitBranchTip],
) -> ApiResult<()> {
    let webhooks = sqlx::query_as::<_, RepositoryWebhook>(
        "SELECT * FROM repository_webhooks WHERE repository_id = $1 AND active = TRUE",
    )
    .bind(repo.id)
    .fetch_all(&state.pool)
    .await?;
    tracing::info!(
        owner = %repo.owner_handle,
        repo = %repo.name,
        webhook_count = webhooks.len(),
        "loaded active repository webhooks"
    );
    if webhooks.is_empty() {
        return Ok(());
    }

    let changes = changed_branch_tips(repo, before_tips).await?;
    tracing::info!(
        owner = %repo.owner_handle,
        repo = %repo.name,
        changed_refs = changes.len(),
        "computed repository webhook push changes"
    );
    for change in changes {
        let payload = gitlab_push_payload(state, repo, auth, &change).await?;
        for webhook in webhooks
            .iter()
            .filter(|webhook| webhook.events.iter().any(|event| event == "push"))
            .filter(|webhook| webhook_matches_branch_filter(webhook, &change.0))
        {
            deliver_repository_webhook(state, webhook, &payload).await;
        }
    }
    Ok(())
}

pub(crate) async fn record_successful_http_push(
    state: &AppState,
    repo: &Repository,
    auth: &AuthUser,
    before_tips: &[GitBranchTip],
) -> ApiResult<()> {
    let before_shas = before_tips
        .iter()
        .map(|tip| tip.sha.clone())
        .collect::<Vec<_>>();
    record_pushed_commit_authors(state, repo, auth, &before_shas).await?;
    sqlx::query("UPDATE repositories SET updated_at = now() WHERE id = $1")
        .bind(repo.id)
        .execute(&state.pool)
        .await?;
    invalidate_repo_cache(state, &repo.owner_handle, &repo.name).await;
    Ok(())
}

pub(crate) async fn test_repository_webhook(
    state: &AppState,
    auth: &AuthUser,
    repo: &Repository,
    webhook_id: Uuid,
) -> ApiResult<()> {
    ensure_repo_admin(&state.pool, auth, repo).await?;
    let webhook = sqlx::query_as::<_, RepositoryWebhook>(
        "SELECT * FROM repository_webhooks WHERE id = $1 AND repository_id = $2",
    )
    .bind(webhook_id)
    .bind(repo.id)
    .fetch_one(&state.pool)
    .await?;
    let branch = webhook
        .push_events_branch_filter
        .as_deref()
        .map(str::trim)
        .filter(|branch| !branch.is_empty() && !branch.contains('*'))
        .unwrap_or(&repo.default_branch);
    let payload = json!({
        "object_kind": "push",
        "event_name": "push",
        "ref": format!("refs/heads/{branch}"),
        "before": "0000000000000000000000000000000000000000",
        "after": "0000000000000000000000000000000000000000",
        "checkout_sha": serde_json::Value::Null,
        "user_name": auth.username,
        "user_username": auth.username,
        "project": gitlab_project_payload(state, repo).await?,
        "repository": gitlab_repository_payload(state, repo).await?,
        "commits": [],
        "total_commits_count": 0
    });
    deliver_repository_webhook(state, &webhook, &payload).await;
    Ok(())
}

pub(crate) async fn gitlab_project_json(state: &AppState, repo: &Repository) -> ApiResult<Value> {
    let project_id = ensure_gitlab_project_id(state, repo.id).await?;
    Ok(json!({
        "id": project_id,
        "name": repo.name,
        "path": repo.name,
        "path_with_namespace": format!("{}/{}", repo.owner_handle, repo.name),
        "namespace": {
            "path": repo.owner_handle,
            "full_path": repo.owner_handle,
            "kind": gitlab_namespace_kind(state, repo).await?
        },
        "web_url": format!("{}/{}/{}", state.config.public_web_url.trim_end_matches('/'), repo.owner_handle, repo.name),
        "http_url_to_repo": format!("{}/{}/{}.git", state.config.app_base_url.trim_end_matches('/'), repo.owner_handle, repo.name),
        "ssh_url_to_repo": repository_ssh_url(&state.config, repo),
        "default_branch": repo.default_branch,
        "visibility": repo.visibility,
        "description": repo.description
    }))
}

async fn find_owned_oauth_application(
    state: &AppState,
    auth: &AuthUser,
    id: Uuid,
) -> ApiResult<OAuthApplication> {
    Ok(sqlx::query_as::<_, OAuthApplication>(
        "SELECT * FROM oauth_applications WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL",
    )
    .bind(id)
    .bind(auth.id)
    .fetch_one(&state.pool)
    .await?)
}

async fn find_oauth_application_by_client_id(
    state: &AppState,
    client_id: &str,
) -> ApiResult<OAuthApplication> {
    let id = Uuid::parse_str(client_id).map_err(|_| ApiError::Unauthorized)?;
    Ok(sqlx::query_as::<_, OAuthApplication>(
        "SELECT * FROM oauth_applications WHERE id = $1 AND revoked_at IS NULL",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?)
}

fn verify_oauth_client_secret(
    application: &OAuthApplication,
    client_secret: &str,
) -> ApiResult<()> {
    if verify(client_secret, &application.client_secret_hash)? {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

async fn exchange_authorization_code(
    state: &AppState,
    application: OAuthApplication,
    code: &str,
    redirect_uri: &str,
) -> ApiResult<OAuthTokenIssueResponse> {
    let row: (
        Uuid,
        Vec<String>,
        String,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
    ) = sqlx::query_as(
        r#"
        SELECT user_id, scopes, redirect_uri, expires_at, used_at
        FROM oauth_authorization_codes
        WHERE code_hash = $1 AND application_id = $2
        "#,
    )
    .bind(oauth_secret_hash(code))
    .bind(application.id)
    .fetch_one(&state.pool)
    .await?;

    if row.4.is_some() || row.3 < Utc::now() || row.2 != redirect_uri {
        return Err(ApiError::Unauthorized);
    }

    sqlx::query("UPDATE oauth_authorization_codes SET used_at = now() WHERE code_hash = $1")
        .bind(oauth_secret_hash(code))
        .execute(&state.pool)
        .await?;

    issue_oauth_tokens(state, application.id, row.0, row.1).await
}

async fn refresh_access_token(
    state: &AppState,
    application: OAuthApplication,
    refresh_token: &str,
) -> ApiResult<OAuthTokenIssueResponse> {
    let row: (Uuid, Uuid, Vec<String>, Option<DateTime<Utc>>) = sqlx::query_as(
        r#"
        SELECT id, user_id, scopes, revoked_at
        FROM oauth_access_tokens
        WHERE refresh_token_hash = $1 AND application_id = $2
        "#,
    )
    .bind(oauth_secret_hash(refresh_token))
    .bind(application.id)
    .fetch_one(&state.pool)
    .await?;

    if row.3.is_some() {
        return Err(ApiError::Unauthorized);
    }

    let access_token = generate_oauth_secret("dgat");
    let next_refresh_token = generate_oauth_secret("dgrt");
    let expires_at = Utc::now() + Duration::hours(OAUTH_ACCESS_TOKEN_TTL_HOURS);
    sqlx::query(
        r#"
        UPDATE oauth_access_tokens
        SET access_token_hash = $2,
            refresh_token_hash = $3,
            expires_at = $4,
            last_used_at = now()
        WHERE id = $1
        "#,
    )
    .bind(row.0)
    .bind(oauth_secret_hash(&access_token))
    .bind(oauth_secret_hash(&next_refresh_token))
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    Ok(oauth_token_issue_response(
        access_token,
        next_refresh_token,
        row.2,
        expires_at,
    ))
}

async fn issue_oauth_tokens(
    state: &AppState,
    application_id: Uuid,
    user_id: Uuid,
    scopes: Vec<String>,
) -> ApiResult<OAuthTokenIssueResponse> {
    let access_token = generate_oauth_secret("dgat");
    let refresh_token = generate_oauth_secret("dgrt");
    let expires_at = Utc::now() + Duration::hours(OAUTH_ACCESS_TOKEN_TTL_HOURS);
    sqlx::query(
        r#"
        INSERT INTO oauth_access_tokens
          (id, application_id, user_id, access_token_hash, refresh_token_hash, scopes, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(application_id)
    .bind(user_id)
    .bind(oauth_secret_hash(&access_token))
    .bind(oauth_secret_hash(&refresh_token))
    .bind(&scopes)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    Ok(oauth_token_issue_response(
        access_token,
        refresh_token,
        scopes,
        expires_at,
    ))
}

fn oauth_token_issue_response(
    access_token: String,
    refresh_token: String,
    scopes: Vec<String>,
    expires_at: DateTime<Utc>,
) -> OAuthTokenIssueResponse {
    OAuthTokenIssueResponse {
        access_token,
        token_type: "Bearer".to_string(),
        expires_in: (expires_at - Utc::now()).num_seconds(),
        refresh_token,
        scope: scopes.join(" "),
        created_at: Utc::now().timestamp(),
    }
}

fn ensure_scopes_allowed_by_application(requested: &[String], allowed: &[String]) -> ApiResult<()> {
    if requested.iter().all(|scope| allowed.contains(scope)) {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

fn normalize_oauth_scopes(scopes: Vec<String>) -> ApiResult<Vec<String>> {
    let mut normalized = Vec::new();
    for scope in scopes {
        let scope = scope.trim().to_string();
        if scope.is_empty() {
            continue;
        }
        if !ALLOWED_OAUTH_SCOPES.contains(&scope.as_str()) {
            return Err(ApiError::BadRequest(format!(
                "unsupported OAuth scope {scope}"
            )));
        }
        if !normalized.contains(&scope) {
            normalized.push(scope);
        }
    }
    if normalized.is_empty() {
        normalized = default_oauth_scopes();
    }
    Ok(normalized)
}

fn default_oauth_scopes() -> Vec<String> {
    vec![
        "api".to_string(),
        "read_user".to_string(),
        "read_repository".to_string(),
    ]
}

fn scope_string_to_vec(scope: &str) -> Vec<String> {
    scope
        .split_whitespace()
        .map(str::to_string)
        .filter(|scope| !scope.is_empty())
        .collect()
}

fn oauth_scope_allows(scopes: &[String], required_scope: &str) -> bool {
    scopes
        .iter()
        .any(|scope| scope == "api" || scope == required_scope)
}

fn generate_oauth_secret(prefix: &str) -> String {
    format!("{prefix}_{}_{}", Uuid::now_v7(), Uuid::new_v4())
}

pub(crate) fn oauth_secret_hash(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

pub(crate) fn oauth_access_token_from_headers(headers: &HeaderMap) -> Option<String> {
    if let Some(token) = bearer_token(headers) {
        return Some(token.to_string());
    }
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Basic "))
        .and_then(|value| general_purpose::STANDARD.decode(value).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|credentials| {
            credentials
                .split_once(':')
                .map(|(_, password)| password.to_string())
        })
}

fn normalize_webhook_events(events: Vec<String>) -> ApiResult<Vec<String>> {
    let mut normalized = Vec::new();
    for event in events {
        let event = event.trim().to_ascii_lowercase();
        if event != "push" {
            return Err(ApiError::BadRequest(format!(
                "unsupported webhook event {event}"
            )));
        }
        if !normalized.contains(&event) {
            normalized.push(event);
        }
    }
    if normalized.is_empty() {
        normalized.push("push".to_string());
    }
    Ok(normalized)
}

fn normalize_gitlab_branch_filter(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_gitlab_branch_filter_strategy(value: Option<String>) -> String {
    match value.as_deref().map(str::trim) {
        Some("all_branches") => "all_branches".to_string(),
        Some("regex") => "regex".to_string(),
        _ => "wildcard".to_string(),
    }
}

fn webhook_matches_branch_filter(webhook: &RepositoryWebhook, branch: &str) -> bool {
    let Some(filter) = webhook
        .push_events_branch_filter
        .as_deref()
        .map(str::trim)
        .filter(|filter| !filter.is_empty())
    else {
        return true;
    };

    match webhook
        .branch_filter_strategy
        .as_deref()
        .unwrap_or("wildcard")
    {
        "all_branches" => true,
        "regex" => Regex::new(filter)
            .map(|pattern| pattern.is_match(branch))
            .unwrap_or(false),
        _ => wildcard_branch_match(filter, branch),
    }
}

fn wildcard_branch_match(pattern: &str, branch: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if !pattern.contains('*') {
        return pattern == branch;
    }

    let mut remaining = branch;
    let mut parts = pattern.split('*').peekable();
    let starts_with_wildcard = pattern.starts_with('*');
    let ends_with_wildcard = pattern.ends_with('*');

    if let Some(first) = parts.next() {
        if !starts_with_wildcard {
            let Some(next_remaining) = remaining.strip_prefix(first) else {
                return false;
            };
            remaining = next_remaining;
        } else if let Some(index) = remaining.find(first) {
            remaining = &remaining[index + first.len()..];
        } else {
            return false;
        }
    }

    while let Some(part) = parts.next() {
        if part.is_empty() {
            continue;
        }
        let is_last = parts.peek().is_none();
        let Some(index) = remaining.find(part) else {
            return false;
        };
        remaining = &remaining[index + part.len()..];
        if is_last && !ends_with_wildcard && !remaining.is_empty() {
            return false;
        }
    }

    true
}

async fn changed_branch_tips(
    repo: &Repository,
    before_tips: &[GitBranchTip],
) -> ApiResult<Vec<(String, String, String)>> {
    let after_tips = git_branch_tips(repo).await?;
    let mut changes = Vec::new();
    for after in &after_tips {
        let before = before_tips
            .iter()
            .find(|tip| tip.name == after.name)
            .map(|tip| tip.sha.clone())
            .unwrap_or_else(zero_sha);
        if before != after.sha {
            changes.push((after.name.clone(), before, after.sha.clone()));
        }
    }
    for before in before_tips {
        if !after_tips.iter().any(|tip| tip.name == before.name) {
            changes.push((before.name.clone(), before.sha.clone(), zero_sha()));
        }
    }
    Ok(changes)
}

fn zero_sha() -> String {
    "0000000000000000000000000000000000000000".to_string()
}

async fn gitlab_push_payload(
    state: &AppState,
    repo: &Repository,
    auth: &AuthUser,
    change: &(String, String, String),
) -> ApiResult<Value> {
    let (branch, before, after) = change;
    let project_id = ensure_gitlab_project_id(state, repo.id).await?;
    let commits = gitlab_push_commits(repo, before, after).await?;
    let total_commits_count = commits.len();
    Ok(json!({
        "object_kind": "push",
        "event_name": "push",
        "ref": format!("refs/heads/{branch}"),
        "before": before,
        "after": after,
        "checkout_sha": if after == &zero_sha() { Value::Null } else { json!(after) },
        "project_id": project_id,
        "user_name": auth.username,
        "user_username": auth.username,
        "project": {
            "id": project_id,
            "name": repo.name,
            "path": repo.name,
            "path_with_namespace": format!("{}/{}", repo.owner_handle, repo.name),
            "web_url": format!("{}/{}/{}", state.config.public_web_url.trim_end_matches('/'), repo.owner_handle, repo.name),
            "git_http_url": format!("{}/{}/{}.git", state.config.app_base_url.trim_end_matches('/'), repo.owner_handle, repo.name),
            "git_ssh_url": repository_ssh_url(&state.config, repo),
            "default_branch": repo.default_branch
        },
        "repository": {
            "name": repo.name,
            "url": format!("{}/{}/{}.git", state.config.app_base_url.trim_end_matches('/'), repo.owner_handle, repo.name),
            "description": repo.description,
            "homepage": format!("{}/{}/{}", state.config.public_web_url.trim_end_matches('/'), repo.owner_handle, repo.name),
            "git_http_url": format!("{}/{}/{}.git", state.config.app_base_url.trim_end_matches('/'), repo.owner_handle, repo.name),
            "git_ssh_url": repository_ssh_url(&state.config, repo),
            "visibility_level": if repo.visibility == "private" { 10 } else { 20 }
        },
        "commits": commits,
        "total_commits_count": total_commits_count
    }))
}

async fn gitlab_push_commits(
    repo: &Repository,
    before: &str,
    after: &str,
) -> ApiResult<Vec<Value>> {
    if after == zero_sha() {
        return Ok(Vec::new());
    }

    let range = if before == zero_sha() {
        after.to_string()
    } else {
        format!("{before}..{after}")
    };
    let output = try_run_git_command(
        repo,
        &[
            "log".to_string(),
            "--max-count=20".to_string(),
            "--reverse".to_string(),
            "--format=%H%x1f%s%x1f%cI%x1f%an%x1f%ae".to_string(),
            range,
        ],
    )
    .await?
    .unwrap_or_default();

    let mut commits = Vec::new();
    for line in output.lines() {
        let Some(commit) = parse_gitlab_push_commit(repo, line).await? else {
            continue;
        };
        commits.push(commit);
    }
    Ok(commits)
}

async fn parse_gitlab_push_commit(repo: &Repository, line: &str) -> ApiResult<Option<Value>> {
    let mut parts = line.split('\x1f');
    let Some(id) = parts.next().map(str::trim).filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    let message = parts.next().unwrap_or_default();
    let timestamp = parts.next().unwrap_or_default();
    let author_name = parts.next().unwrap_or("Unknown author");
    let author_email = parts.next().unwrap_or_default();
    let modified = gitlab_commit_changed_paths(repo, id).await?;

    Ok(Some(json!({
        "id": id,
        "message": message,
        "timestamp": timestamp,
        "url": Value::Null,
        "author": {
            "name": author_name,
            "email": author_email
        },
        "added": [],
        "modified": modified,
        "removed": []
    })))
}

async fn gitlab_commit_changed_paths(
    repo: &Repository,
    commit_sha: &str,
) -> ApiResult<Vec<String>> {
    let output = try_run_git_command(
        repo,
        &[
            "diff-tree".to_string(),
            "--no-commit-id".to_string(),
            "--name-only".to_string(),
            "-r".to_string(),
            commit_sha.to_string(),
        ],
    )
    .await?
    .unwrap_or_default();
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect())
}

async fn gitlab_project_payload(state: &AppState, repo: &Repository) -> ApiResult<Value> {
    gitlab_project_json(state, repo).await
}

async fn gitlab_repository_payload(state: &AppState, repo: &Repository) -> ApiResult<Value> {
    Ok(json!({
        "name": repo.name,
        "url": format!("{}/{}/{}.git", state.config.app_base_url.trim_end_matches('/'), repo.owner_handle, repo.name),
        "description": repo.description,
        "homepage": format!("{}/{}/{}", state.config.public_web_url.trim_end_matches('/'), repo.owner_handle, repo.name),
        "git_http_url": format!("{}/{}/{}.git", state.config.app_base_url.trim_end_matches('/'), repo.owner_handle, repo.name),
        "git_ssh_url": repository_ssh_url(&state.config, repo),
        "visibility_level": if repo.visibility == "private" { 10 } else { 20 }
    }))
}

fn gitlab_project_hook_json(
    state: &AppState,
    repo: &Repository,
    project_id: i64,
    webhook: RepositoryWebhook,
) -> Value {
    let push_events = webhook.events.iter().any(|event| event == "push");
    json!({
        "id": webhook.id.to_string(),
        "url": webhook.url,
        "project_id": project_id,
        "push_events": push_events,
        "issues_events": false,
        "merge_requests_events": false,
        "tag_push_events": false,
        "note_events": false,
        "job_events": false,
        "pipeline_events": false,
        "wiki_page_events": false,
        "deployment_events": false,
        "releases_events": false,
        "enable_ssl_verification": true,
        "repository_update_events": false,
        "alert_status": webhook.last_status,
        "disabled_until": Value::Null,
        "url_variables": [],
        "created_at": webhook.created_at,
        "resource_access_token_events": false,
        "custom_webhook_template": Value::Null,
        "push_events_branch_filter": webhook.push_events_branch_filter,
        "branch_filter_strategy": webhook.branch_filter_strategy.unwrap_or_else(|| "wildcard".to_string()),
        "active": webhook.active,
        "last_status_code": webhook.last_status_code,
        "last_error": webhook.last_error,
        "last_delivered_at": webhook.last_delivered_at,
        "web_url": format!("{}/{}/{}/-/hooks/{}", state.config.public_web_url.trim_end_matches('/'), repo.owner_handle, repo.name, webhook.id)
    })
}

async fn deliver_repository_webhook(
    state: &AppState,
    webhook: &RepositoryWebhook,
    payload: &Value,
) {
    let mut request = state
        .http
        .post(&webhook.url)
        .header("X-Gitlab-Event", "Push Hook")
        .json(payload);
    if let Some(secret) = webhook
        .secret
        .as_deref()
        .filter(|secret| !secret.is_empty())
    {
        request = request.header("X-Gitlab-Token", secret);
    }

    let started = std::time::Instant::now();
    let result = tokio::time::timeout(WEBHOOK_DELIVERY_TIMEOUT, request.send()).await;
    match result {
        Ok(Ok(response)) => {
            let status_code = i32::from(response.status().as_u16());
            let status = if response.status().is_success() {
                "success"
            } else {
                "failed"
            };
            let error_body = if response.status().is_success() {
                None
            } else {
                response.text().await.ok().filter(|body| !body.is_empty())
            };
            let _ = sqlx::query(
                r#"
                UPDATE repository_webhooks
                SET last_status = $2,
                    last_status_code = $3,
                    last_error = $4,
                    last_delivered_at = now(),
                    updated_at = now()
                WHERE id = $1
                "#,
            )
            .bind(webhook.id)
            .bind(status)
            .bind(status_code)
            .bind(error_body)
            .execute(&state.pool)
            .await;
            tracing::info!(
                webhook_id = %webhook.id,
                status = %status,
                status_code = status_code,
                elapsed_ms = started.elapsed().as_millis(),
                "repository webhook delivery completed"
            );
        }
        Ok(Err(error)) => {
            let error = error.to_string();
            record_repository_webhook_failure(state, webhook.id, &error).await;
            tracing::warn!(
                webhook_id = %webhook.id,
                %error,
                elapsed_ms = started.elapsed().as_millis(),
                "repository webhook delivery failed"
            );
        }
        Err(_) => {
            let error = format!(
                "webhook delivery timed out after {} seconds",
                WEBHOOK_DELIVERY_TIMEOUT.as_secs()
            );
            record_repository_webhook_failure(state, webhook.id, &error).await;
            tracing::warn!(
                webhook_id = %webhook.id,
                %error,
                elapsed_ms = started.elapsed().as_millis(),
                "repository webhook delivery timed out"
            );
        }
    }
}

async fn record_repository_webhook_failure(state: &AppState, webhook_id: Uuid, error: &str) {
    let _ = sqlx::query(
        r#"
        UPDATE repository_webhooks
        SET last_status = 'failed',
            last_status_code = NULL,
            last_error = $2,
            last_delivered_at = now(),
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(webhook_id)
    .bind(error)
    .execute(&state.pool)
    .await;
}

async fn gitlab_namespace_kind(state: &AppState, repo: &Repository) -> ApiResult<String> {
    let kind: Option<String> =
        sqlx::query_scalar("SELECT kind FROM namespaces WHERE name = $1 LIMIT 1")
            .bind(&repo.owner_handle)
            .fetch_optional(&state.pool)
            .await?;
    Ok(match kind.as_deref() {
        Some("organization") => "group".to_string(),
        _ => "user".to_string(),
    })
}

pub(crate) fn repository_ssh_url(config: &Config, repo: &Repository) -> String {
    let ssh_public_host = config.public_api_host();
    if config.ssh_port == 22 {
        format!(
            "git@{}:{}/{}.git",
            ssh_public_host, repo.owner_handle, repo.name
        )
    } else {
        format!(
            "ssh://git@{}:{}/{}/{}.git",
            ssh_public_host, config.ssh_port, repo.owner_handle, repo.name
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_secret_hash_is_stable() {
        assert_eq!(oauth_secret_hash("token"), oauth_secret_hash("token"));
        assert_ne!(oauth_secret_hash("token"), oauth_secret_hash("other"));
    }

    #[test]
    fn oauth_scopes_reject_unknown_values() {
        assert!(normalize_oauth_scopes(vec!["api".to_string()]).is_ok());
        assert!(normalize_oauth_scopes(vec!["sudo".to_string()]).is_err());
    }

    #[test]
    fn bearer_token_takes_precedence_over_basic() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer abc".parse().unwrap());
        assert_eq!(
            oauth_access_token_from_headers(&headers),
            Some("abc".to_string())
        );
    }

    #[test]
    fn percent_decodes_project_refs() {
        assert_eq!(
            percent_decode_project_ref("haouarihk%2Fmoneyloop-io").unwrap(),
            "haouarihk/moneyloop-io"
        );
    }
}
