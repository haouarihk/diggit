use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use serde_json::{Value, json};

use crate::{error::ApiResult, models::*, services::*, state::AppState};

pub(crate) async fn get_user_profile(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> ApiResult<Json<UserResponse>> {
    let username = normalize_name(&username)?;
    let user = get_user_by_username(&state.pool, &username).await?;
    Ok(Json(user_response(&state.config, user)))
}

pub(crate) async fn list_user_repos(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(username): Path<String>,
    Query(query): Query<RepoListQuery>,
) -> ApiResult<Json<Value>> {
    let auth = optional_auth(&state, &headers)?;
    let username = normalize_name(&username)?;
    get_user_by_username(&state.pool, &username).await?;
    let repos = owner_repositories(&state, &username, query, auth.as_ref()).await?;
    Ok(Json(json!({ "data": repos })))
}
