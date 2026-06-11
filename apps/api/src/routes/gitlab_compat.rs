use axum::{
    Form, Json,
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, Uri},
    response::{Html, IntoResponse, Redirect, Response},
};
use bcrypt::verify;
use serde_json::{Value, json};
use std::{process::Stdio, str::FromStr};
use tokio::{io::AsyncWriteExt, process::Command};
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

pub(crate) async fn list_oauth_applications_route(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    Ok(Json(
        json!({ "data": list_oauth_applications(&state, &auth).await? }),
    ))
}

pub(crate) async fn create_oauth_application_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateOAuthApplicationRequest>,
) -> ApiResult<Json<CreatedOAuthApplicationResponse>> {
    let auth = require_auth(&state, &headers)?;
    Ok(Json(create_oauth_application(&state, &auth, input).await?))
}

pub(crate) async fn update_oauth_application_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateOAuthApplicationRequest>,
) -> ApiResult<Json<OAuthApplicationResponse>> {
    let auth = require_auth(&state, &headers)?;
    Ok(Json(
        update_oauth_application(&state, &auth, id, input).await?,
    ))
}

pub(crate) async fn rotate_oauth_application_secret_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<RotatedOAuthApplicationSecretResponse>> {
    let auth = require_auth(&state, &headers)?;
    Ok(Json(
        rotate_oauth_application_secret(&state, &auth, id).await?,
    ))
}

pub(crate) async fn delete_oauth_application_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let auth = require_auth(&state, &headers)?;
    delete_oauth_application(&state, &auth, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn list_oauth_tokens_route(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    Ok(Json(
        json!({ "data": list_oauth_tokens(&state, &auth).await? }),
    ))
}

pub(crate) async fn revoke_oauth_token_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let auth = require_auth(&state, &headers)?;
    revoke_oauth_token(&state, &auth, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn oauth_authorize_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OAuthAuthorizeQuery>,
) -> ApiResult<Html<String>> {
    validate_oauth_authorize_request(&query)?;
    let application: OAuthApplication =
        sqlx::query_as("SELECT * FROM oauth_applications WHERE id = $1 AND revoked_at IS NULL")
            .bind(Uuid::parse_str(&query.client_id).map_err(|_| ApiError::Unauthorized)?)
            .fetch_one(&state.pool)
            .await?;
    if !oauth_redirect_uri_matches(&application.redirect_uri, &query.redirect_uri)? {
        return Err(ApiError::Unauthorized);
    }
    let signed_in_user = optional_auth(&state, &headers)
        .ok()
        .flatten()
        .map(|auth| auth.username);
    Ok(Html(oauth_authorize_page(
        &application,
        &query,
        signed_in_user.as_deref(),
    )))
}

pub(crate) async fn oauth_authorize_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(input): Form<OAuthAuthorizeForm>,
) -> ApiResult<Redirect> {
    validate_oauth_authorize_form(&input)?;
    let user = match optional_auth(&state, &headers)? {
        Some(auth) => get_user_by_id(&state.pool, auth.id).await?,
        None => {
            let username = input.username.as_deref().ok_or(ApiError::Unauthorized)?;
            let password = input.password.as_deref().ok_or(ApiError::Unauthorized)?;
            authenticate_password_user(&state, username, password).await?
        }
    };
    let code = create_oauth_authorization_code(
        &state,
        &user,
        &input.client_id,
        &input.redirect_uri,
        oauth_requested_scope(input.scope.as_deref(), input.scopes.as_deref()),
    )
    .await?;
    let separator = if input.redirect_uri.contains('?') {
        '&'
    } else {
        '?'
    };
    let mut redirect = format!(
        "{}{}code={}",
        input.redirect_uri,
        separator,
        url_component(&code)
    );
    if let Some(state_value) = input.state.as_deref().filter(|value| !value.is_empty()) {
        redirect.push_str("&state=");
        redirect.push_str(&url_component(state_value));
    }
    Ok(Redirect::to(&redirect))
}

pub(crate) async fn oauth_token(
    State(state): State<AppState>,
    Form(input): Form<OAuthTokenRequest>,
) -> ApiResult<Json<OAuthTokenIssueResponse>> {
    Ok(Json(exchange_oauth_token(&state, input).await?))
}

pub(crate) async fn gitlab_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_oauth_access(&state, &headers, "read_user").await?;
    let user = get_user_by_id(&state.pool, auth.user.id).await?;
    Ok(Json(json!({
        "id": user.id.to_string(),
        "username": user.username,
        "name": user.display_name,
        "avatar_url": user.avatar_url,
        "web_url": format!("{}/users/{}", state.config.public_web_url.trim_end_matches('/'), user.username)
    })))
}

pub(crate) async fn gitlab_projects(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<GitlabPageQuery>,
) -> ApiResult<Response> {
    let auth = require_oauth_access(&state, &headers, "read_repository").await?;
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(100).clamp(1, 100);
    let _membership = query.membership.unwrap_or(true);
    let repos = oauth_accessible_repositories(&state, &auth).await?;
    let total = repos.len() as i64;
    let start = ((page - 1) * per_page) as usize;
    let end = (start + per_page as usize).min(repos.len());
    let mut data = Vec::new();
    if start < repos.len() {
        for repo in &repos[start..end] {
            data.push(gitlab_project_json(&state, repo).await?);
        }
    }
    let total_pages = if total == 0 {
        1
    } else {
        (total + per_page - 1) / per_page
    };
    gitlab_json_response(
        json!(data),
        &[
            ("x-total", total.to_string()),
            ("x-total-pages", total_pages.to_string()),
            ("x-page", page.to_string()),
            ("x-per-page", per_page.to_string()),
            (
                "x-next-page",
                if page < total_pages {
                    (page + 1).to_string()
                } else {
                    String::new()
                },
            ),
            (
                "x-prev-page",
                if page > 1 {
                    (page - 1).to_string()
                } else {
                    String::new()
                },
            ),
        ],
    )
}

pub(crate) async fn gitlab_project_branches(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_ref): Path<String>,
    Query(query): Query<GitlabPageQuery>,
) -> ApiResult<Response> {
    let auth = require_oauth_access(&state, &headers, "read_repository").await?;
    let repo = repository_by_gitlab_project_ref(&state, &project_ref).await?;
    ensure_oauth_repo_visible(&state, &auth, &repo).await?;
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(100).clamp(1, 100);
    let branches = list_branches(&repo).await?;
    let total = branches.len() as i64;
    let start = ((page - 1) * per_page) as usize;
    let end = (start + per_page as usize).min(branches.len());
    let data: Vec<Value> = if start < branches.len() {
        branches[start..end]
            .iter()
            .map(|branch| {
                json!({
                    "name": branch.name,
                    "default": branch.is_default,
                    "protected": false,
                    "commit": {
                        "id": branch.commit_sha.clone().unwrap_or_default(),
                        "short_id": branch.commit_sha.clone().unwrap_or_default().chars().take(8).collect::<String>()
                    }
                })
            })
            .collect()
    } else {
        Vec::new()
    };
    let total_pages = if total == 0 {
        1
    } else {
        (total + per_page - 1) / per_page
    };
    gitlab_json_response(
        json!(data),
        &[
            ("x-total", total.to_string()),
            ("x-total-pages", total_pages.to_string()),
            ("x-page", page.to_string()),
            ("x-per-page", per_page.to_string()),
        ],
    )
}

pub(crate) async fn gitlab_project_hooks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_ref): Path<String>,
) -> ApiResult<Json<Vec<Value>>> {
    let auth = require_oauth_access(&state, &headers, "api").await?;
    let repo = repository_by_gitlab_project_ref(&state, &project_ref).await?;
    Ok(Json(list_gitlab_project_hooks(&state, &auth, &repo).await?))
}

pub(crate) async fn create_gitlab_project_hook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(project_ref): Path<String>,
    Json(input): Json<CreateGitlabProjectHookRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_oauth_access(&state, &headers, "api").await?;
    let repo = repository_by_gitlab_project_ref(&state, &project_ref).await?;
    Ok(Json(
        create_gitlab_project_hook(&state, &auth, &repo, input).await?,
    ))
}

pub(crate) async fn update_gitlab_project_hook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_ref, hook_id)): Path<(String, String)>,
    Json(input): Json<CreateGitlabProjectHookRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_oauth_access(&state, &headers, "api").await?;
    let repo = repository_by_gitlab_project_ref(&state, &project_ref).await?;
    Ok(Json(
        update_gitlab_project_hook(&state, &auth, &repo, &hook_id, input).await?,
    ))
}

pub(crate) async fn delete_gitlab_project_hook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_ref, hook_id)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let auth = require_oauth_access(&state, &headers, "api").await?;
    let repo = repository_by_gitlab_project_ref(&state, &project_ref).await?;
    delete_gitlab_project_hook(&state, &auth, &repo, &hook_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn test_gitlab_project_hook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((project_ref, hook_id)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let auth = require_oauth_access(&state, &headers, "api").await?;
    let repo = repository_by_gitlab_project_ref(&state, &project_ref).await?;
    test_gitlab_project_hook(&state, &auth, &repo, &hook_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn smart_git_info_refs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, repo_git)): Path<(String, String)>,
    uri: Uri,
) -> ApiResult<Response> {
    smart_git_http(
        state,
        headers,
        owner,
        repo_git,
        "info/refs",
        uri,
        Bytes::new(),
        false,
    )
    .await
}

pub(crate) async fn smart_git_upload_pack(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, repo_git)): Path<(String, String)>,
    uri: Uri,
    body: Bytes,
) -> ApiResult<Response> {
    smart_git_http(
        state,
        headers,
        owner,
        repo_git,
        "git-upload-pack",
        uri,
        body,
        false,
    )
    .await
}

pub(crate) async fn smart_git_receive_pack(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, repo_git)): Path<(String, String)>,
    uri: Uri,
    body: Bytes,
) -> ApiResult<Response> {
    smart_git_http(
        state,
        headers,
        owner,
        repo_git,
        "git-receive-pack",
        uri,
        body,
        true,
    )
    .await
}

pub(crate) async fn list_repository_webhooks_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    Ok(Json(
        json!({ "data": list_repository_webhooks(&state, &auth, &repo).await? }),
    ))
}

pub(crate) async fn create_repository_webhook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name)): Path<(String, String)>,
    Json(input): Json<CreateRepositoryWebhookRequest>,
) -> ApiResult<Json<RepositoryWebhookResponse>> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    Ok(Json(
        create_repository_webhook(&state, &auth, &repo, input).await?,
    ))
}

pub(crate) async fn delete_repository_webhook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, webhook_id)): Path<(String, String, Uuid)>,
) -> ApiResult<StatusCode> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    delete_repository_webhook(&state, &auth, &repo, webhook_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn test_repository_webhook_route(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((owner, name, webhook_id)): Path<(String, String, Uuid)>,
) -> ApiResult<StatusCode> {
    let auth = require_auth(&state, &headers)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    test_repository_webhook(&state, &auth, &repo, webhook_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn smart_git_http(
    state: AppState,
    headers: HeaderMap,
    owner: String,
    repo_git: String,
    git_path: &str,
    uri: Uri,
    body: Bytes,
    dispatch_push_webhooks: bool,
) -> ApiResult<Response> {
    let name = repo_git
        .strip_suffix(".git")
        .ok_or(ApiError::NotFound)?
        .to_string();
    let auth = match require_oauth_access(&state, &headers, "read_repository").await {
        Ok(auth) => auth,
        Err(ApiError::Unauthorized) => return Ok(git_basic_auth_challenge()),
        Err(error) => return Err(error),
    };
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_oauth_repo_visible(&state, &auth, &repo).await?;
    ensure_repo_head(&repo, state.config.as_ref()).await?;
    let before_tips = if dispatch_push_webhooks {
        git_webhook_ref_tips(&repo).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut command = Command::new("git");
    command
        .arg("http-backend")
        .env("GIT_PROJECT_ROOT", &state.config.git_storage_path)
        .env("GIT_HTTP_EXPORT_ALL", "1")
        .env(
            "REQUEST_METHOD",
            if body.is_empty() { "GET" } else { "POST" },
        )
        .env("PATH_INFO", format!("/{owner}/{name}.git/{git_path}"))
        .env("QUERY_STRING", uri.query().unwrap_or(""))
        .env(
            "CONTENT_TYPE",
            headers
                .get("content-type")
                .and_then(|value| value.to_str().ok())
                .unwrap_or(""),
        )
        .env("CONTENT_LENGTH", body.len().to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(ApiError::from)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(&body).await.map_err(ApiError::from)?;
    }
    let output = child.wait_with_output().await.map_err(ApiError::from)?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    if dispatch_push_webhooks {
        let state = state.clone();
        let auth = auth.user;
        tokio::spawn(async move {
            if let Err(error) =
                record_successful_http_push(&state, &repo, &auth, &before_tips).await
            {
                tracing::warn!(%error, "failed to record HTTP push metadata");
                return;
            }
            if let Err(error) =
                dispatch_repository_webhooks(&state, &repo, &auth, &before_tips).await
            {
                tracing::warn!(%error, "failed to dispatch repository webhooks after HTTP push");
            }
        });
    }
    cgi_response(output.stdout)
}

fn git_basic_auth_challenge() -> Response {
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header("WWW-Authenticate", r#"Basic realm="Diggit Git""#)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Body::from("Authentication required\n"))
        .unwrap_or_else(|_| StatusCode::UNAUTHORIZED.into_response())
}

fn cgi_response(output: Vec<u8>) -> ApiResult<Response> {
    let split_at = output
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|position| (position, 4))
        .or_else(|| {
            output
                .windows(2)
                .position(|window| window == b"\n\n")
                .map(|position| (position, 2))
        })
        .ok_or_else(|| ApiError::BadRequest("invalid Git HTTP response".to_string()))?;
    let (header_bytes, body_bytes) = output.split_at(split_at.0);
    let body_bytes = body_bytes[split_at.1..].to_vec();
    let headers = String::from_utf8_lossy(header_bytes);
    let mut builder = Response::builder().status(StatusCode::OK);
    for line in headers.lines() {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("status") {
            if let Some(code) = value.trim().split_whitespace().next() {
                if let Ok(status) = StatusCode::from_str(code) {
                    builder = builder.status(status);
                }
            }
            continue;
        }
        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.trim().as_bytes()),
            HeaderValue::from_str(value.trim()),
        ) {
            builder = builder.header(header_name, header_value);
        }
    }
    builder
        .body(Body::from(body_bytes))
        .map_err(|_| ApiError::BadRequest("invalid Git HTTP response".to_string()))
}

async fn authenticate_password_user(
    state: &AppState,
    username: &str,
    password: &str,
) -> ApiResult<User> {
    let username = normalize_name(username)?;
    let row: (
        Uuid,
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        String,
        chrono::DateTime<chrono::Utc>,
    ) = sqlx::query_as(
        r#"
        SELECT id, username, display_name, avatar_url, password_hash, actor_url, inbox_url, outbox_url, created_at
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(username)
    .fetch_one(&state.pool)
    .await?;
    if !verify(password, &row.4)? {
        return Err(ApiError::Unauthorized);
    }
    Ok(User {
        id: row.0,
        username: row.1,
        display_name: row.2,
        avatar_url: row.3,
        actor_url: row.5,
        inbox_url: row.6,
        outbox_url: row.7,
        created_at: row.8,
    })
}

fn validate_oauth_authorize_request(input: &OAuthAuthorizeQuery) -> ApiResult<()> {
    if input.response_type.as_deref().unwrap_or("code") != "code" {
        return Err(ApiError::BadRequest(
            "response_type must be code".to_string(),
        ));
    }
    validate_remote_url(&input.redirect_uri)?;
    Ok(())
}

fn validate_oauth_authorize_form(input: &OAuthAuthorizeForm) -> ApiResult<()> {
    if input.response_type.as_deref().unwrap_or("code") != "code" {
        return Err(ApiError::BadRequest(
            "response_type must be code".to_string(),
        ));
    }
    validate_remote_url(&input.redirect_uri)?;
    Ok(())
}

fn oauth_authorize_page(
    application: &OAuthApplication,
    query: &OAuthAuthorizeQuery,
    signed_in_user: Option<&str>,
) -> String {
    let scope = oauth_requested_scope(query.scope.as_deref(), query.scopes.as_deref())
        .unwrap_or("api read_user read_repository");
    let state = query.state.as_deref().unwrap_or("");
    let fields = match signed_in_user {
        Some(username) => format!(
            r#"<p class="muted">Signed in as <strong>{}</strong>.</p>"#,
            html_escape(username)
        ),
        None => r#"<label>Username <input name="username" autocomplete="username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>"#
            .to_string(),
    };
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize {app_name}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 0; color: #1f2328; background: #f6f8fa; }}
    main {{ max-width: 680px; margin: 8vh auto; background: white; border: 1px solid #d0d7de; border-radius: 8px; padding: 24px; }}
    label {{ display: grid; gap: 6px; margin: 14px 0; font-weight: 600; }}
    input {{ border: 1px solid #d0d7de; border-radius: 6px; padding: 10px 12px; font: inherit; }}
    button {{ border: 1px solid rgba(0,0,0,.15); border-radius: 6px; background: #1a7f37; color: white; font-weight: 700; padding: 10px 14px; }}
    .muted {{ color: #59636e; }}
    code {{ background: #f6f8fa; padding: 2px 5px; border-radius: 4px; }}
  </style>
</head>
<body>
  <main>
    <p class="muted">Diggit OAuth</p>
    <h1>Authorize {app_name}</h1>
    <p class="muted">This app is requesting <code>{scope}</code> access for Dokploy-compatible GitLab integration.</p>
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="{client_id}">
      <input type="hidden" name="redirect_uri" value="{redirect_uri}">
      <input type="hidden" name="response_type" value="code">
      <input type="hidden" name="scope" value="{scope}">
      <input type="hidden" name="state" value="{state}">
      {fields}
      <button type="submit">Authorize application</button>
    </form>
  </main>
</body>
</html>"#,
        app_name = html_escape(&application.name),
        client_id = html_escape(&query.client_id),
        redirect_uri = html_escape(&query.redirect_uri),
        scope = html_escape(scope),
        state = html_escape(state),
        fields = fields
    )
}

fn oauth_requested_scope<'a>(scope: Option<&'a str>, scopes: Option<&'a str>) -> Option<&'a str> {
    scope.or(scopes)
}

fn gitlab_json_response(value: Value, headers: &[(&str, String)]) -> ApiResult<Response> {
    let body = serde_json::to_vec(&value)
        .map_err(|_| ApiError::BadRequest("invalid JSON response".to_string()))?;
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json");
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
    builder
        .body(Body::from(body))
        .map_err(|_| ApiError::BadRequest("invalid JSON response".to_string()))
}

fn url_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
