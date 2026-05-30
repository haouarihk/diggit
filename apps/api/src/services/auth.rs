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

pub(crate) fn require_auth(state: &AppState, headers: &HeaderMap) -> ApiResult<AuthUser> {
    let token = bearer_token(headers).ok_or(ApiError::Unauthorized)?;
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?
    .claims;

    Ok(AuthUser {
        id: claims.sub,
        username: claims.username,
    })
}

pub(crate) fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
}

pub(crate) fn require_admin(state: &AppState, auth: &AuthUser) -> ApiResult<()> {
    if state.config.is_admin(&auth.username) {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
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
