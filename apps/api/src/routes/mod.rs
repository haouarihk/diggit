use axum::{
    Router,
    routing::delete,
    routing::{get, post},
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::state::AppState;

pub(crate) mod admin;
pub(crate) mod auth;
pub(crate) mod federation;
pub(crate) mod health;
pub(crate) mod keys;
pub(crate) mod organizations;
pub(crate) mod repositories;
pub(crate) mod runners;
pub(crate) mod search;
pub(crate) mod users;

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/me", get(auth::me))
        .route("/search", get(search::search))
        .route(
            "/user/keys",
            get(keys::list_ssh_keys).post(keys::create_ssh_key),
        )
        .route("/user/keys/{id}", delete(keys::delete_ssh_key))
        .route(
            "/admin/actions/runners/registration-token",
            post(runners::create_server_runner_token),
        )
        .route("/admin/actions/runners", get(runners::list_server_runners))
        .route(
            "/user/actions/runners/registration-token",
            post(runners::create_user_runner_token),
        )
        .route("/user/actions/runners", get(runners::list_user_runners))
        .route(
            "/orgs/{org}/actions/runners/registration-token",
            post(runners::create_org_runner_token),
        )
        .route(
            "/orgs/{org}/actions/runners",
            get(runners::list_org_runners),
        )
        .route(
            "/repos/{owner}/{name}/actions/runners/registration-token",
            post(runners::create_repo_runner_token),
        )
        .route(
            "/repos/{owner}/{name}/actions/runners",
            get(runners::list_repo_runners),
        )
        .route("/api/actions/register", post(runners::register_runner))
        .route(
            "/api/actions/runner.v1.RunnerService/FetchTask",
            post(runners::fetch_runner_task),
        )
        .route(
            "/repos",
            get(repositories::list_repos).post(repositories::create_repo),
        )
        .route("/users/{username}", get(users::get_user_profile))
        .route("/users/{username}/repos", get(users::list_user_repos))
        .route(
            "/organizations",
            get(organizations::list_organizations).post(organizations::create_organization),
        )
        .route(
            "/organizations/{name}",
            get(organizations::get_organization).delete(organizations::delete_organization),
        )
        .route(
            "/organizations/{name}/repos",
            get(organizations::list_organization_repos),
        )
        .route(
            "/organizations/{name}/members",
            get(organizations::list_organization_members),
        )
        .route("/repos/{owner}/{name}", get(repositories::get_repo))
        .route(
            "/repos/{owner}/{name}/tree",
            get(repositories::list_repo_tree),
        )
        .route(
            "/repos/{owner}/{name}/contents",
            get(repositories::get_repo_file)
                .put(repositories::update_repo_file)
                .delete(repositories::delete_repo_path),
        )
        .route(
            "/repos/{owner}/{name}/raw",
            get(repositories::get_repo_raw_file),
        )
        .route(
            "/repos/{owner}/{name}/star",
            post(repositories::star_repo).delete(repositories::unstar_repo),
        )
        .route("/repos/{owner}/{name}/fork", post(repositories::fork_repo))
        .route(
            "/repos/{owner}/{name}/pull-requests",
            get(repositories::list_pull_requests).post(repositories::create_pull_request),
        )
        .route(
            "/servers",
            get(admin::list_servers).post(admin::upsert_server),
        )
        .route("/activities", get(admin::list_activities))
        .route("/.well-known/webfinger", get(federation::webfinger))
        .route("/actors/{username}", get(federation::actor))
        .route("/actors/{username}/outbox", get(federation::outbox))
        .route("/inbox", post(federation::inbox))
        .route("/{owner}/{name}", get(repositories::get_repo))
        .route("/{owner}/{name}/fork", post(repositories::fork_repo))
        .route(
            "/{owner}/{name}/pull-requests",
            get(repositories::list_pull_requests).post(repositories::create_pull_request),
        )
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
