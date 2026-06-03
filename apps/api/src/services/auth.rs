use super::*;

pub(crate) fn create_token(config: &Config, user: &User) -> ApiResult<String> {
    let exp = (Utc::now() + Duration::days(14)).timestamp() as usize;
    let claims = Claims {
        sub: user.id,
        username: user.username.clone(),
        exp,
    };
    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )?)
}

pub(crate) fn create_federated_identity_token(
    config: &Config,
    user: &User,
    audience: &str,
    scope: &str,
    nonce: &str,
) -> ApiResult<(String, DateTime<Utc>)> {
    let now = Utc::now();
    let expires_at = now + Duration::minutes(10);
    let claims = FederatedIdentityClaims {
        iss: config.app_base_url.trim_end_matches('/').to_string(),
        sub: user.actor_url.clone(),
        preferred_username: user.username.clone(),
        display_name: user.display_name.clone(),
        avatar_url: user.avatar_url.clone(),
        aud: audience.trim_end_matches('/').to_string(),
        scope: scope.to_string(),
        exp: expires_at.timestamp() as usize,
        iat: now.timestamp() as usize,
        nonce: nonce.to_string(),
        jti: Uuid::now_v7().to_string(),
    };
    Ok((
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
        )?,
        expires_at,
    ))
}

pub(crate) fn create_federated_session_token(
    config: &Config,
    token: &FederatedTokenResponse,
) -> ApiResult<(String, DateTime<Utc>)> {
    let now = Utc::now();
    let expires_at = now + Duration::hours(2);
    let claims = FederatedSessionClaims {
        iss: config.app_base_url.trim_end_matches('/').to_string(),
        sub: token.actor_url.clone(),
        preferred_username: token.username.clone(),
        display_name: token.display_name.clone(),
        avatar_url: token.avatar_url.clone(),
        aud: config.app_base_url.trim_end_matches('/').to_string(),
        home_server: token.issuer.trim_end_matches('/').to_string(),
        scope: token.scope.clone(),
        exp: expires_at.timestamp() as usize,
        iat: now.timestamp() as usize,
        nonce: token.nonce.clone(),
        jti: Uuid::now_v7().to_string(),
    };
    Ok((
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
        )?,
        expires_at,
    ))
}

pub(crate) fn require_auth(state: &AppState, headers: &HeaderMap) -> ApiResult<AuthUser> {
    let token = bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    decode_local_auth(state, token)
}

pub(crate) fn optional_auth(state: &AppState, headers: &HeaderMap) -> ApiResult<Option<AuthUser>> {
    let Some(token) = bearer_token(headers) else {
        return Ok(None);
    };
    decode_local_auth(state, token).map(Some)
}

fn decode_local_auth(state: &AppState, token: &str) -> ApiResult<AuthUser> {
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| ApiError::Unauthorized)?
    .claims;

    Ok(AuthUser {
        id: claims.sub,
        username: claims.username,
    })
}

pub(crate) fn require_repo_action_auth(
    state: &AppState,
    headers: &HeaderMap,
    required_scope: &str,
) -> ApiResult<RepoActionAuth> {
    let token = bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    if let Ok(claims) = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    ) {
        return Ok(RepoActionAuth::Local(AuthUser {
            id: claims.claims.sub,
            username: claims.claims.username,
        }));
    }

    let mut validation = Validation::default();
    validation.set_audience(&[state.config.app_base_url.trim_end_matches('/')]);
    let claims = decode::<FederatedSessionClaims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )?
    .claims;
    if claims.aud != state.config.app_base_url.trim_end_matches('/') {
        return Err(ApiError::Unauthorized);
    }
    let scopes = scopes(&claims.scope);
    if !scopes.iter().any(|scope| scope == required_scope) {
        return Err(ApiError::Unauthorized);
    }

    Ok(RepoActionAuth::Federated(FederatedAuthUser {
        actor_url: claims.sub,
        username: claims.preferred_username,
        display_name: claims.display_name,
        avatar_url: claims.avatar_url,
        home_server: claims.home_server,
        scopes,
    }))
}

pub(crate) fn require_federated_identity(
    state: &AppState,
    headers: &HeaderMap,
    required_scope: &str,
) -> ApiResult<FederatedAuthUser> {
    let token = bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    let mut validation = Validation::default();
    validation.validate_aud = false;
    let claims = decode::<FederatedIdentityClaims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )?
    .claims;
    if claims.iss != state.config.app_base_url.trim_end_matches('/') {
        return Err(ApiError::Unauthorized);
    }
    let scopes = scopes(&claims.scope);
    if !scopes.iter().any(|scope| scope == required_scope) {
        return Err(ApiError::Unauthorized);
    }
    Ok(FederatedAuthUser {
        actor_url: claims.sub,
        username: claims.preferred_username,
        display_name: claims.display_name,
        avatar_url: claims.avatar_url,
        home_server: claims.iss,
        scopes,
    })
}

pub(crate) fn require_current_user(
    state: &AppState,
    headers: &HeaderMap,
) -> ApiResult<Result<AuthUser, FederatedAuthUser>> {
    let token = bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    if let Ok(claims) = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    ) {
        return Ok(Ok(AuthUser {
            id: claims.claims.sub,
            username: claims.claims.username,
        }));
    }

    let mut validation = Validation::default();
    validation.set_audience(&[state.config.app_base_url.trim_end_matches('/')]);
    let claims = decode::<FederatedSessionClaims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )?
    .claims;
    if claims.aud != state.config.app_base_url.trim_end_matches('/') {
        return Err(ApiError::Unauthorized);
    }
    Ok(Err(FederatedAuthUser {
        actor_url: claims.sub,
        username: claims.preferred_username,
        display_name: claims.display_name,
        avatar_url: claims.avatar_url,
        home_server: claims.home_server,
        scopes: scopes(&claims.scope),
    }))
}

pub(crate) fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
}

pub(crate) fn scopes(scope: &str) -> Vec<String> {
    scope
        .split_whitespace()
        .map(str::to_string)
        .filter(|scope| !scope.is_empty())
        .collect()
}

pub(crate) fn verify_pkce(code_verifier: &str, code_challenge: &str) -> ApiResult<()> {
    let digest = Sha256::digest(code_verifier.as_bytes());
    let calculated = general_purpose::URL_SAFE_NO_PAD.encode(digest);
    if calculated == code_challenge {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

pub(crate) fn require_admin(state: &AppState, auth: &AuthUser) -> ApiResult<()> {
    if state.config.is_admin(&auth.username) {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

pub(crate) fn current_user_response(config: &Config, user: User) -> CurrentUserResponse {
    let response = user_response(config, user);
    CurrentUserResponse {
        id: Some(response.id),
        kind: "local".to_string(),
        username: response.username,
        display_name: response.display_name,
        avatar_url: response.avatar_url,
        avatar_fallback: response.avatar_fallback,
        actor_url: response.actor_url,
        inbox_url: Some(response.inbox_url),
        outbox_url: Some(response.outbox_url),
        is_admin: response.is_admin,
        home_server: None,
        capabilities: vec![
            "repo:star".to_string(),
            "repo:fork".to_string(),
            "repo:create".to_string(),
            "settings:local".to_string(),
        ],
        created_at: Some(response.created_at),
    }
}

pub(crate) fn federated_user_response(user: FederatedAuthUser) -> CurrentUserResponse {
    CurrentUserResponse {
        id: None,
        kind: "federated".to_string(),
        username: user.username,
        display_name: user.display_name.clone(),
        avatar_url: user.avatar_url,
        avatar_fallback: avatar_fallback(&user.display_name),
        actor_url: user.actor_url,
        inbox_url: None,
        outbox_url: None,
        is_admin: false,
        home_server: Some(user.home_server),
        capabilities: user.scopes,
        created_at: None,
    }
}

pub(crate) fn user_response(config: &Config, user: User) -> UserResponse {
    let avatar_fallback = avatar_fallback(&user.display_name);
    UserResponse {
        is_admin: config.is_admin(&user.username),
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        avatar_fallback,
        actor_url: user.actor_url,
        inbox_url: user.inbox_url,
        outbox_url: user.outbox_url,
        created_at: user.created_at,
    }
}

pub(crate) fn avatar_fallback(label: &str) -> String {
    label
        .chars()
        .find(|char| char.is_ascii_alphanumeric())
        .unwrap_or('?')
        .to_ascii_uppercase()
        .to_string()
}

pub(crate) async fn get_user_by_id(pool: &PgPool, id: Uuid) -> ApiResult<User> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, username, display_name, avatar_url, actor_url, inbox_url, outbox_url, created_at FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?)
}

pub(crate) async fn get_user_by_username(pool: &PgPool, username: &str) -> ApiResult<User> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, username, display_name, avatar_url, actor_url, inbox_url, outbox_url, created_at FROM users WHERE username = $1",
    )
    .bind(username)
    .fetch_one(pool)
    .await?)
}

pub(crate) async fn get_user_by_actor_url(pool: &PgPool, actor_url: &str) -> ApiResult<User> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, username, display_name, avatar_url, actor_url, inbox_url, outbox_url, created_at FROM users WHERE actor_url = $1",
    )
    .bind(actor_url)
    .fetch_one(pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        Config {
            database_url: String::new(),
            redis_url: None,
            cache_ttl_seconds: 60,
            app_base_url: "https://visited.example.com".to_string(),
            public_web_url: "https://visited.example.com".to_string(),
            git_storage_path: PathBuf::new(),
            jwt_secret: "test-secret".to_string(),
            admin_usernames: vec!["alice".to_string()],
            ssh_host: "visited.example.com".to_string(),
            ssh_port: 22,
            port: 3001,
        }
    }

    fn test_user() -> User {
        User {
            id: Uuid::now_v7(),
            username: "alice".to_string(),
            display_name: "Alice".to_string(),
            avatar_url: Some("https://example.com/alice.png".to_string()),
            actor_url: "https://home.example.com/actors/alice".to_string(),
            inbox_url: "https://home.example.com/actors/alice/inbox".to_string(),
            outbox_url: "https://home.example.com/actors/alice/outbox".to_string(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn scopes_split_space_separated_capabilities() {
        assert_eq!(
            scopes("repo:star repo:fork  "),
            vec!["repo:star".to_string(), "repo:fork".to_string()]
        );
    }

    #[test]
    fn pkce_verifier_must_match_challenge() {
        let verifier = "correct horse battery staple";
        let digest = Sha256::digest(verifier.as_bytes());
        let challenge = general_purpose::URL_SAFE_NO_PAD.encode(digest);

        assert!(verify_pkce(verifier, &challenge).is_ok());
        assert!(verify_pkce("wrong", &challenge).is_err());
    }

    #[test]
    fn federated_identity_token_is_audience_bound_and_scoped() {
        let config = test_config();
        let user = test_user();
        let (token, _) = create_federated_identity_token(
            &config,
            &user,
            "https://other.example.com",
            "repo:star repo:fork",
            "nonce",
        )
        .unwrap();
        let mut validation = Validation::default();
        validation.set_audience(&["https://other.example.com"]);
        let claims = decode::<FederatedIdentityClaims>(
            &token,
            &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
            &validation,
        )
        .unwrap()
        .claims;

        assert_eq!(claims.aud, "https://other.example.com");
        assert_eq!(claims.iss, "https://visited.example.com");
        assert_eq!(claims.scope, "repo:star repo:fork");
        assert_eq!(claims.nonce, "nonce");
    }
}
