use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use bcrypt::{DEFAULT_COST, hash, verify};
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

pub(crate) async fn register(
    State(state): State<AppState>,
    Json(input): Json<RegisterRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let username = normalize_name(&input.username)?;
    ensure_claimable_owner_name(&username)?;
    ensure_namespace_available(&state.pool, &username).await?;
    if input.password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".to_string(),
        ));
    }

    let id = Uuid::now_v7();
    let actor_url = state.config.actor_url(&username);
    let inbox_url = format!("{actor_url}/inbox");
    let outbox_url = format!("{actor_url}/outbox");
    let display_name = input.display_name.unwrap_or_else(|| username.clone());
    let password_hash = hash(input.password, DEFAULT_COST)?;

    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, username, display_name, password_hash, actor_url, inbox_url, outbox_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, username, display_name, avatar_url, actor_url, inbox_url, outbox_url, created_at
        "#,
    )
    .bind(id)
    .bind(&username)
    .bind(&display_name)
    .bind(password_hash)
    .bind(actor_url)
    .bind(inbox_url)
    .bind(outbox_url)
    .fetch_one(&state.pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO namespaces (id, name, kind, user_id)
        VALUES ($1, $2, 'user', $3)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(&username)
    .bind(user.id)
    .execute(&state.pool)
    .await?;

    let token = create_token(&state.config, &user)?;
    Ok(Json(AuthResponse {
        token,
        user: user_response(&state.config, user),
    }))
}

pub(crate) async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let row: (
        Uuid,
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        String,
        DateTime<Utc>,
    ) = sqlx::query_as(
        r#"
        SELECT id, username, display_name, avatar_url, password_hash, actor_url, inbox_url, outbox_url, created_at
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(normalize_name(&input.username)?)
    .fetch_one(&state.pool)
    .await?;

    if !verify(input.password, &row.4)? {
        return Err(ApiError::Unauthorized);
    }

    let user = User {
        id: row.0,
        username: row.1,
        display_name: row.2,
        avatar_url: row.3,
        actor_url: row.5,
        inbox_url: row.6,
        outbox_url: row.7,
        created_at: row.8,
    };
    let token = create_token(&state.config, &user)?;
    Ok(Json(AuthResponse {
        token,
        user: user_response(&state.config, user),
    }))
}

pub(crate) async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<CurrentUserResponse>> {
    match require_current_user(&state, &headers)? {
        Ok(auth) => {
            let user = get_user_by_id(&state.pool, auth.id).await?;
            Ok(Json(current_user_response(&state.config, user)))
        }
        Err(user) => Ok(Json(federated_user_response(user))),
    }
}

pub(crate) async fn discovery(State(state): State<AppState>) -> Json<DiggitDiscoveryResponse> {
    let base = state.config.app_base_url.trim_end_matches('/');
    Json(DiggitDiscoveryResponse {
        issuer: base.to_string(),
        authorization_endpoint: format!("{base}/auth/federated/authorize"),
        token_endpoint: format!("{base}/auth/federated/token"),
        jwks_uri: format!("{base}/.well-known/diggit/jwks.json"),
    })
}

pub(crate) async fn jwks(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "keys": [{
            "kty": "oct",
            "kid": state.config.host(),
            "alg": "HS256",
            "use": "sig"
        }]
    }))
}

pub(crate) async fn federated_authorize_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(input): Query<FederatedAuthorizeRequest>,
) -> ApiResult<Json<FederatedAuthorizeResponse>> {
    create_federated_authorization_code(state, headers, input).await
}

pub(crate) async fn federated_authorize(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<FederatedAuthorizeRequest>,
) -> ApiResult<Json<FederatedAuthorizeResponse>> {
    create_federated_authorization_code(state, headers, input).await
}

async fn create_federated_authorization_code(
    state: AppState,
    headers: HeaderMap,
    input: FederatedAuthorizeRequest,
) -> ApiResult<Json<FederatedAuthorizeResponse>> {
    let auth = require_auth(&state, &headers)?;
    if input.audience.trim_end_matches('/') == state.config.app_base_url.trim_end_matches('/') {
        return Err(ApiError::BadRequest(
            "audience must be a different Diggit instance".to_string(),
        ));
    }
    if !input.redirect_uri.starts_with(&input.audience) {
        return Err(ApiError::BadRequest(
            "redirect_uri must belong to the audience".to_string(),
        ));
    }
    let code = Uuid::now_v7().to_string();
    let expires_at = Utc::now() + chrono::Duration::minutes(5);
    sqlx::query(
        r#"
        INSERT INTO federated_authorization_codes
          (code, user_id, client_id, redirect_uri, audience, scope, state, nonce, code_challenge, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(&code)
    .bind(auth.id)
    .bind(input.client_id)
    .bind(&input.redirect_uri)
    .bind(input.audience.trim_end_matches('/'))
    .bind(input.scope)
    .bind(&input.state)
    .bind(input.nonce)
    .bind(input.code_challenge)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    let separator = if input.redirect_uri.contains('?') { '&' } else { '?' };
    Ok(Json(FederatedAuthorizeResponse {
        redirect_uri: format!(
            "{}{}code={}&state={}",
            input.redirect_uri, separator, code, input.state
        ),
        code,
    }))
}

pub(crate) async fn federated_token(
    State(state): State<AppState>,
    Json(input): Json<FederatedTokenRequest>,
) -> ApiResult<Json<FederatedTokenResponse>> {
    let row: (
        Uuid,
        String,
        String,
        String,
        String,
        String,
        String,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
    ) = sqlx::query_as(
        r#"
        SELECT user_id, client_id, redirect_uri, audience, scope, nonce, code_challenge, expires_at, used_at
        FROM federated_authorization_codes
        WHERE code = $1
        "#,
    )
    .bind(&input.code)
    .fetch_one(&state.pool)
    .await?;

    if row.8.is_some() || row.7 < Utc::now() || row.1 != input.client_id || row.2 != input.redirect_uri {
        return Err(ApiError::Unauthorized);
    }
    verify_pkce(&input.code_verifier, &row.6)?;

    sqlx::query("UPDATE federated_authorization_codes SET used_at = now() WHERE code = $1")
        .bind(&input.code)
        .execute(&state.pool)
        .await?;

    let user = get_user_by_id(&state.pool, row.0).await?;
    let (identity_token, expires_at) =
        create_federated_identity_token(&state.config, &user, &row.3, &row.4, &row.5)?;

    Ok(Json(FederatedTokenResponse {
        identity_token,
        token_type: "Bearer".to_string(),
        expires_in: (expires_at - Utc::now()).num_seconds(),
        issuer: state.config.app_base_url.trim_end_matches('/').to_string(),
        audience: row.3,
        actor_url: user.actor_url,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        scope: row.4,
        nonce: row.5,
    }))
}

pub(crate) async fn federated_exchange(
    State(state): State<AppState>,
    Json(input): Json<FederatedExchangeRequest>,
) -> ApiResult<Json<FederatedExchangeResponse>> {
    let home_server = input.home_server.trim_end_matches('/').to_string();
    if let Some(host) = host_from_actor(&home_server) {
        ensure_server_allowed(&state.pool, &host).await?;
    }
    let token: FederatedTokenResponse = state
        .http
        .post(format!("{home_server}/auth/federated/token"))
        .json(&FederatedTokenRequest {
            code: input.code,
            client_id: input.client_id,
            redirect_uri: input.redirect_uri,
            code_verifier: input.code_verifier,
        })
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    if token.issuer.trim_end_matches('/') != home_server {
        return Err(ApiError::Unauthorized);
    }
    if token.audience.trim_end_matches('/') != state.config.app_base_url.trim_end_matches('/') {
        return Err(ApiError::Unauthorized);
    }
    let scopes = scopes(&token.scope);
    if !scopes.iter().any(|scope| scope == "repo:star") {
        return Err(ApiError::Unauthorized);
    }

    let (session_token, expires_at) = create_federated_session_token(&state.config, &token)?;
    let user = FederatedAuthUser {
        actor_url: token.actor_url.clone(),
        username: token.username.clone(),
        display_name: token.display_name.clone(),
        avatar_url: token.avatar_url.clone(),
        home_server: home_server.clone(),
        scopes,
    };

    Ok(Json(FederatedExchangeResponse {
        token: session_token,
        home_token: token.identity_token,
        expires_at,
        user: federated_user_response(user),
    }))
}

pub(crate) async fn federated_fork(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<FederatedForkRequest>,
) -> ApiResult<Json<RepositoryResponse>> {
    let auth = require_federated_identity(&state, &headers, "repo:fork")?;
    let user = get_user_by_actor_url(&state.pool, &auth.actor_url).await?;
    let source_repo_url = input.source_repo_url.trim_end_matches('/').to_string();
    let source_server = remote_base_url(&source_repo_url).ok_or_else(|| {
        ApiError::BadRequest("source_repo_url must be an absolute URL".to_string())
    })?;
    let fork_name = normalize_name(
        input
            .name
            .as_deref()
            .unwrap_or_else(|| source_repo_url.rsplit('/').next().unwrap_or("fork")),
    )?;
    let local_path = repo_path(&state.config, &user.username, &fork_name);
    create_bare_repo(&local_path).await?;

    let repo = sqlx::query_as::<_, Repository>(
        r#"
        INSERT INTO repositories
          (id, namespace_id, owner_id, owner_handle, name, description, visibility, local_path,
           remote_url, remote_server, source_remote_url)
        SELECT $1, namespaces.id, $2, $3, $4, $5, 'public', $6, $7, $8, $7
        FROM namespaces
        WHERE namespaces.user_id = $2
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(user.id)
    .bind(&user.username)
    .bind(&fork_name)
    .bind(format!("Fork of {source_repo_url}"))
    .bind(local_path.to_string_lossy().to_string())
    .bind(&source_repo_url)
    .bind(host_from_actor(&source_repo_url))
    .fetch_one(&state.pool)
    .await?;
    try_initialize_fork_from_source(&repo, &source_repo_url).await;

    let activity_id = format!(
        "{}/activities/{}",
        state.config.app_base_url,
        Uuid::now_v7()
    );
    let activity = json!({
        "@context": "https://www.w3.org/ns/activitystreams",
        "id": activity_id,
        "type": "Create",
        "actor": user.actor_url,
        "object": {
            "type": "RepositoryFork",
            "source": source_repo_url,
            "fork": repo_activity_url(&state.config, &repo),
            "name": repo.name,
            "server": state.config.host()
        }
    });
    record_activity(
        &state.pool,
        "outbound",
        host_from_actor(&source_server).as_deref(),
        &activity,
        "queued",
    )
    .await?;
    deliver_activity(&state, &source_server, &activity).await;
    invalidate_repo_cache(&state, &repo.owner_handle, &repo.name).await;
    Ok(Json(
        repository_response(&state.pool, &state.config, repo).await?,
    ))
}

fn remote_base_url(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let host = rest.split('/').next()?;
    if host.is_empty() {
        None
    } else {
        Some(format!("{scheme}://{host}"))
    }
}
