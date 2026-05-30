use axum::{Json, extract::State, http::HeaderMap};
use bcrypt::{DEFAULT_COST, hash, verify};
use chrono::{DateTime, Utc};
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
) -> ApiResult<Json<UserResponse>> {
    let auth = require_auth(&state, &headers)?;
    let user = get_user_by_id(&state.pool, auth.id).await?;
    Ok(Json(user_response(&state.config, user)))
}
