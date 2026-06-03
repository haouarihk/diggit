use axum::{
    Json,
    extract::{Query, State},
};
use serde_json::{Value, json};

use crate::{error::ApiResult, models::*, services::*, state::AppState};

pub(crate) async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<Value>> {
    let raw_query = query.q.unwrap_or_default();
    let parsed = ParsedSearchQuery::parse(&raw_query);
    let search_type = query
        .search_type
        .unwrap_or_else(|| "repositories".to_string());

    let repos = public_repositories(&state.pool).await?;
    let users = sqlx::query_as::<_, User>(
        "SELECT id, username, display_name, avatar_url, actor_url, inbox_url, outbox_url, created_at FROM users ORDER BY username ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let mut repository_results = Vec::new();
    for repo in repos
        .into_iter()
        .filter(|repo| parsed.matches_repository(repo))
    {
        repository_results.push(repository_response(&state.pool, &state.config, repo).await?);
    }

    let user_results: Vec<SearchUserResult> = users
        .into_iter()
        .filter(|user| parsed.matches_user(user))
        .map(|user| {
            let response = user_response(&state.config, user);
            SearchUserResult {
                id: response.id,
                username: response.username,
                display_name: response.display_name,
                avatar_url: response.avatar_url,
                avatar_fallback: response.avatar_fallback,
                is_admin: response.is_admin,
                created_at: response.created_at,
            }
        })
        .collect();

    let data = match search_type.as_str() {
        "users" => json!({ "users": user_results, "repositories": [] }),
        "repositories" => json!({ "repositories": repository_results, "users": [] }),
        _ => json!({ "repositories": repository_results, "users": user_results }),
    };

    Ok(Json(json!({
        "query": raw_query,
        "parsed": parsed,
        "federated": {
            "mode": "known-records",
            "description": "Search includes local records and repositories discovered from federated activity."
        },
        "unsupportedTypes": ["code", "issues", "pull-requests", "discussions"],
        "data": data
    })))
}
