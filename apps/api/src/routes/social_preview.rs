use axum::{
    extract::{Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use sqlx::Row;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

const MAX_AVATAR_BYTES: usize = 2 * 1024 * 1024;
const SOCIAL_PREVIEW_CACHE_VERSION: &str = "v2";

pub(crate) async fn repo_preview_image(
    State(state): State<AppState>,
    Path((owner, name)): Path<(String, String)>,
) -> ApiResult<Response> {
    let owner = normalize_name(&owner)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, None, &repo).await?;

    let cache_key = cache_key(&[
        "social",
        SOCIAL_PREVIEW_CACHE_VERSION,
        "repo",
        &owner,
        &name,
        "preview_png",
    ]);
    if let Some(cached) = state.cache.get_bytes(&cache_key).await {
        return Ok(png_response(cached));
    }

    let data = repo_preview_data(&state, repo).await?;
    let png = render_preview_for_data(&state, &data).await?;
    state
        .cache
        .set_bytes_with_ttl(
            &cache_key,
            &png,
            state.config.social_preview_cache_ttl_seconds,
        )
        .await;
    Ok(png_response(png))
}

pub(crate) async fn issue_preview_image(
    State(state): State<AppState>,
    Path((owner, name, number)): Path<(String, String, i32)>,
) -> ApiResult<Response> {
    let owner = normalize_name(&owner)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, None, &repo).await?;

    let cache_key = cache_key(&[
        "social",
        SOCIAL_PREVIEW_CACHE_VERSION,
        "repo",
        &owner,
        &name,
        "issue",
        &number.to_string(),
        "preview_png",
    ]);
    if let Some(cached) = state.cache.get_bytes(&cache_key).await {
        return Ok(png_response(cached));
    }

    let issue = sqlx::query_as::<_, Issue>(
        r#"
        SELECT issues.*,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', issue_labels.id, 'name', issue_labels.name, 'color', issue_labels.color) ORDER BY issue_labels.name)
            FROM issue_label_assignments
            JOIN issue_labels ON issue_labels.id = issue_label_assignments.label_id
            WHERE issue_label_assignments.issue_id = issues.id
          ), '[]'::jsonb) AS labels
        FROM issues
        WHERE repository_id = $1 AND number = $2
        "#,
    )
    .bind(repo.id)
    .bind(number)
    .fetch_one(&state.pool)
    .await?;
    let data = issue_preview_data(&state, &repo, issue).await?;
    let png = render_preview_for_data(&state, &data).await?;
    state
        .cache
        .set_bytes_with_ttl(
            &cache_key,
            &png,
            state.config.social_preview_cache_ttl_seconds,
        )
        .await;
    Ok(png_response(png))
}

pub(crate) async fn pull_request_preview_image(
    State(state): State<AppState>,
    Path((owner, name, id)): Path<(String, String, i64)>,
) -> ApiResult<Response> {
    let owner = normalize_name(&owner)?;
    let repo = find_repo(&state.pool, &owner, &name).await?;
    ensure_repo_visible(&state.pool, None, &repo).await?;

    let cache_key = cache_key(&[
        "social",
        SOCIAL_PREVIEW_CACHE_VERSION,
        "repo",
        &owner,
        &name,
        "pull",
        &id.to_string(),
        "preview_png",
    ]);
    if let Some(cached) = state.cache.get_bytes(&cache_key).await {
        return Ok(png_response(cached));
    }

    let pull_request = sqlx::query_as::<_, PullRequest>(
        "SELECT * FROM pull_requests WHERE target_repository_id = $1 AND id = $2",
    )
    .bind(repo.id)
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    let data = pull_request_preview_data(&state, &repo, pull_request).await?;
    let png = render_preview_for_data(&state, &data).await?;
    state
        .cache
        .set_bytes_with_ttl(
            &cache_key,
            &png,
            state.config.social_preview_cache_ttl_seconds,
        )
        .await;
    Ok(png_response(png))
}

pub(crate) async fn user_preview_image(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> ApiResult<Response> {
    let username = normalize_name(&username)?;
    let cache_key = cache_key(&[
        "social",
        SOCIAL_PREVIEW_CACHE_VERSION,
        "user",
        &username,
        "preview_png",
    ]);
    if let Some(cached) = state.cache.get_bytes(&cache_key).await {
        return Ok(png_response(cached));
    }

    let user = get_user_by_username(&state.pool, &username).await?;
    let data = user_preview_data(&state, user).await?;
    let png = render_preview_for_data(&state, &data).await?;
    state
        .cache
        .set_bytes_with_ttl(
            &cache_key,
            &png,
            state.config.social_preview_cache_ttl_seconds,
        )
        .await;
    Ok(png_response(png))
}

pub(crate) async fn organization_preview_image(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<Response> {
    let name = normalize_name(&name)?;
    let cache_key = cache_key(&[
        "social",
        SOCIAL_PREVIEW_CACHE_VERSION,
        "organization",
        &name,
        "preview_png",
    ]);
    if let Some(cached) = state.cache.get_bytes(&cache_key).await {
        return Ok(png_response(cached));
    }

    let organization = get_organization_by_name(&state.pool, &name).await?;
    let data = organization_preview_data(&state, organization).await?;
    let png = render_preview_for_data(&state, &data).await?;
    state
        .cache
        .set_bytes_with_ttl(
            &cache_key,
            &png,
            state.config.social_preview_cache_ttl_seconds,
        )
        .await;
    Ok(png_response(png))
}

pub(crate) async fn dev_preview_image(
    State(state): State<AppState>,
    Query(query): Query<DevSocialPreviewQuery>,
) -> ApiResult<Response> {
    if !cfg!(debug_assertions) {
        return Err(ApiError::NotFound);
    }

    let data = dev_preview_data(query);

    Ok(dev_png_response(
        render_preview_for_data(&state, &data).await?,
    ))
}

fn dev_preview_data(query: DevSocialPreviewQuery) -> SocialPreviewData {
    let preview_type = query.preview_type.as_deref().unwrap_or("repository");
    let avatar_url = query.avatar_url.filter(|value| !value.trim().is_empty());
    let avatar_fallback = query.avatar_fallback.unwrap_or_else(|| "DG".to_string());
    let website_label = query.website_label.unwrap_or_else(|| "Diggit".to_string());

    match preview_type {
        "issue" => {
            let number = query.number.unwrap_or(42);
            let status = query.status.unwrap_or_else(|| "open".to_string());
            let title = query
                .title
                .unwrap_or_else(|| "Improve repository previews".to_string());
            SocialPreviewData {
                owner: query
                    .owner
                    .unwrap_or_else(|| "acme/rocket-launcher".to_string()),
                title: numbered_title(number, &title),
                description: query.description.unwrap_or_else(|| {
                    "Issue preview cards should show title, author context, comments, and activity."
                        .to_string()
                }),
                avatar_url,
                avatar_fallback,
                website_label,
                stats: vec![
                    SocialPreviewStat {
                        kind: SocialPreviewStatKind::Issues,
                        label: format!("{} issue", title_case_status(&status)),
                        value: number,
                    },
                    SocialPreviewStat {
                        kind: SocialPreviewStatKind::Comments,
                        label: "Comments".to_string(),
                        value: query.comments.unwrap_or(9),
                    },
                    SocialPreviewStat {
                        kind: SocialPreviewStatKind::Activity,
                        label: "Activity".to_string(),
                        value: query.activity.unwrap_or(14),
                    },
                ],
            }
        }
        "pull_request" => {
            let number = query.number.unwrap_or(17);
            let status = query.status.unwrap_or_else(|| "open".to_string());
            let source_branch = query
                .source_branch
                .unwrap_or_else(|| "feature/social-previews".to_string());
            let target_branch = query.target_branch.unwrap_or_else(|| "main".to_string());
            let title = query
                .title
                .unwrap_or_else(|| "Add social preview cards".to_string());
            SocialPreviewData {
                owner: query
                    .owner
                    .unwrap_or_else(|| "acme/rocket-launcher".to_string()),
                title: numbered_title(number, &title),
                description: query.description.unwrap_or_else(|| {
                    format!(
                        "{} pull request from {source_branch} into {target_branch}.",
                        title_case_status(&status)
                    )
                }),
                avatar_url,
                avatar_fallback,
                website_label,
                stats: vec![
                    SocialPreviewStat {
                        kind: SocialPreviewStatKind::PullRequests,
                        label: format!("{} PR", title_case_status(&status)),
                        value: number,
                    },
                    SocialPreviewStat {
                        kind: SocialPreviewStatKind::Comments,
                        label: "Comments".to_string(),
                        value: query.comments.unwrap_or(5),
                    },
                    SocialPreviewStat {
                        kind: SocialPreviewStatKind::Activity,
                        label: "Activity".to_string(),
                        value: query.activity.unwrap_or(8),
                    },
                ],
            }
        }
        _ => SocialPreviewData {
            owner: query.owner.unwrap_or_else(|| "diggit".to_string()),
            title: query.title.unwrap_or_else(|| "social-preview".to_string()),
            description: query.description.unwrap_or_else(|| {
                "A polished social preview generated by the Rust backend.".to_string()
            }),
            avatar_url,
            avatar_fallback,
            website_label,
            stats: vec![
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Contributors,
                    label: "Contributors".to_string(),
                    value: query.contributors.unwrap_or(12),
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Issues,
                    label: "Issues".to_string(),
                    value: query.issues.unwrap_or(8),
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::PullRequests,
                    label: "Pull requests".to_string(),
                    value: query.pull_requests.unwrap_or(3),
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Discussions,
                    label: "Discussions".to_string(),
                    value: query.discussions.unwrap_or(0),
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Stars,
                    label: "Stars".to_string(),
                    value: query.stars.unwrap_or(128),
                },
                SocialPreviewStat {
                    kind: SocialPreviewStatKind::Forks,
                    label: "Forks".to_string(),
                    value: query.forks.unwrap_or(14),
                },
            ],
        },
    }
}

async fn repo_preview_data(state: &AppState, repo: Repository) -> ApiResult<SocialPreviewData> {
    let repository_id = repo.id;
    let default_branch = repo.default_branch.clone();
    let contributors = repository_contributors(&state.pool, &repo, Some(&default_branch))
        .await
        .map(|response| response.data.len() as i64)
        .unwrap_or(0);
    let issues = open_issue_count(state, repository_id).await?;
    let pull_requests = open_pull_request_count(state, repository_id).await?;
    let response = repository_response(&state.pool, &state.config, repo).await?;

    Ok(SocialPreviewData {
        owner: response.owner.handle,
        title: response.name,
        description: response.description,
        avatar_url: response.owner.avatar_url,
        avatar_fallback: response.owner.avatar_fallback,
        website_label: "Diggit".to_string(),
        stats: vec![
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Contributors,
                label: "Contributors".to_string(),
                value: contributors,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Issues,
                label: "Issues".to_string(),
                value: issues,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::PullRequests,
                label: "Pull requests".to_string(),
                value: pull_requests,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Discussions,
                label: "Discussions".to_string(),
                value: 0,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Stars,
                label: "Stars".to_string(),
                value: response.stars_count as i64,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Forks,
                label: "Forks".to_string(),
                value: response.forks_count,
            },
        ],
    })
}

async fn issue_preview_data(
    state: &AppState,
    repo: &Repository,
    issue: Issue,
) -> ApiResult<SocialPreviewData> {
    let comments_count = issue_comment_count(state, issue.id).await?;
    let activity_count = issue_activity_count(state, issue.id).await?;
    let owner = format!("{}/{}", repo.owner_handle, repo.name);
    let description = if issue.body.trim().is_empty() {
        format!(
            "{} issue opened by {}.",
            title_case_status(&issue.status),
            issue.author_handle
        )
    } else {
        issue.body.clone()
    };

    Ok(SocialPreviewData {
        owner,
        title: numbered_title(issue.number as i64, &issue.title),
        description,
        avatar_url: issue.author_avatar_url,
        avatar_fallback: avatar_fallback(if issue.author_display_name.trim().is_empty() {
            &issue.author_handle
        } else {
            &issue.author_display_name
        }),
        website_label: "Diggit".to_string(),
        stats: vec![
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Issues,
                label: format!("{} issue", title_case_status(&issue.status)),
                value: issue.number as i64,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Comments,
                label: "Comments".to_string(),
                value: comments_count,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Activity,
                label: "Activity".to_string(),
                value: activity_count,
            },
        ],
    })
}

async fn pull_request_preview_data(
    state: &AppState,
    repo: &Repository,
    pull_request: PullRequest,
) -> ApiResult<SocialPreviewData> {
    let comments_count = pull_request_comment_count(state, pull_request.id).await?;
    let activity_count = pull_request_activity_count(state, pull_request.id).await?;
    let author = author_identity(state, &pull_request.author_handle).await?;
    let owner = format!("{}/{}", repo.owner_handle, repo.name);
    let description = if pull_request.body.trim().is_empty() {
        format!(
            "{} pull request from {} into {}.",
            title_case_status(&pull_request.status),
            pull_request.source_branch,
            pull_request.target_branch
        )
    } else {
        pull_request.body.clone()
    };

    Ok(SocialPreviewData {
        owner,
        title: numbered_title(pull_request.id, &pull_request.title),
        description,
        avatar_url: author.avatar_url,
        avatar_fallback: author.avatar_fallback,
        website_label: "Diggit".to_string(),
        stats: vec![
            SocialPreviewStat {
                kind: SocialPreviewStatKind::PullRequests,
                label: format!("{} PR", title_case_status(&pull_request.status)),
                value: pull_request.id,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Comments,
                label: "Comments".to_string(),
                value: comments_count,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Activity,
                label: "Activity".to_string(),
                value: activity_count,
            },
        ],
    })
}

async fn user_preview_data(state: &AppState, user: User) -> ApiResult<SocialPreviewData> {
    let repos_count = public_repo_count(state, &user.username).await?;
    let stars_count = public_repo_stars_count(state, &user.username).await?;

    Ok(SocialPreviewData {
        owner: format!("@{}", user.username),
        title: user.display_name.clone(),
        description: format!("{}'s public repositories on Diggit.", user.display_name),
        avatar_url: user.avatar_url,
        avatar_fallback: avatar_fallback(&user.display_name),
        website_label: "Diggit".to_string(),
        stats: vec![
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Repositories,
                label: "Repositories".to_string(),
                value: repos_count,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Stars,
                label: "Stars".to_string(),
                value: stars_count,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Forks,
                label: "Forks".to_string(),
                value: public_repo_forks_count(state, &user.username).await?,
            },
        ],
    })
}

async fn organization_preview_data(
    state: &AppState,
    organization: Organization,
) -> ApiResult<SocialPreviewData> {
    let repos_count = public_repo_count(state, &organization.name).await?;
    let members_count = organization_members_count(state, organization.id).await?;

    Ok(SocialPreviewData {
        owner: format!("@{}", organization.name),
        title: organization.display_name.clone(),
        description: if organization.description.trim().is_empty() {
            format!(
                "{}'s public repositories on Diggit.",
                organization.display_name
            )
        } else {
            organization.description
        },
        avatar_url: None,
        avatar_fallback: avatar_fallback(&organization.display_name),
        website_label: "Diggit".to_string(),
        stats: vec![
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Repositories,
                label: "Repositories".to_string(),
                value: repos_count,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Members,
                label: "Members".to_string(),
                value: members_count,
            },
            SocialPreviewStat {
                kind: SocialPreviewStatKind::Stars,
                label: "Stars".to_string(),
                value: public_repo_stars_count(state, &organization.name).await?,
            },
        ],
    })
}

async fn render_preview_for_data(state: &AppState, data: &SocialPreviewData) -> ApiResult<Vec<u8>> {
    let avatar = avatar_data_uri_for_url(state, data.avatar_url.as_deref()).await;
    render_social_preview_png(SocialPreviewRenderInput {
        data,
        avatar_data_uri: avatar.as_deref(),
    })
}

async fn avatar_data_uri_for_url(state: &AppState, avatar_url: Option<&str>) -> Option<String> {
    let avatar_url = avatar_url?.trim();
    if !(avatar_url.starts_with("https://") || avatar_url.starts_with("http://")) {
        return None;
    }

    let response = state.http.get(avatar_url).send().await.ok()?;
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = response.bytes().await.ok()?;
    if bytes.len() > MAX_AVATAR_BYTES {
        return None;
    }

    avatar_data_uri(&content_type, &bytes)
}

async fn open_issue_count(state: &AppState, repository_id: uuid::Uuid) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM issues WHERE repository_id = $1 AND status = 'open'",
    )
    .bind(repository_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn open_pull_request_count(state: &AppState, repository_id: uuid::Uuid) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM pull_requests WHERE target_repository_id = $1 AND status = 'open'",
    )
    .bind(repository_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn public_repo_count(state: &AppState, owner: &str) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM repositories WHERE owner_handle = $1 AND visibility = 'public'",
    )
    .bind(owner)
    .fetch_one(&state.pool)
    .await?)
}

async fn public_repo_stars_count(state: &AppState, owner: &str) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COALESCE(SUM(stars_count), 0)::BIGINT FROM repositories WHERE owner_handle = $1 AND visibility = 'public'",
    )
    .bind(owner)
    .fetch_one(&state.pool)
    .await?)
}

async fn public_repo_forks_count(state: &AppState, owner: &str) -> ApiResult<i64> {
    let rows = sqlx::query(
        r#"
        SELECT id
        FROM repositories
        WHERE owner_handle = $1 AND visibility = 'public'
        "#,
    )
    .bind(owner)
    .fetch_all(&state.pool)
    .await?;

    let mut total = 0_i64;
    for row in rows {
        let repo_id = row.get::<uuid::Uuid, _>("id");
        let forks: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)::BIGINT FROM repositories WHERE source_repository_id = $1",
        )
        .bind(repo_id)
        .fetch_one(&state.pool)
        .await?;
        total += forks;
    }

    Ok(total)
}

async fn organization_members_count(
    state: &AppState,
    organization_id: uuid::Uuid,
) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM organization_members WHERE organization_id = $1",
    )
    .bind(organization_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn issue_comment_count(state: &AppState, issue_id: uuid::Uuid) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM comments WHERE issue_id = $1 AND deleted_at IS NULL",
    )
    .bind(issue_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn pull_request_comment_count(state: &AppState, pull_request_id: i64) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM comments WHERE pull_request_id = $1 AND deleted_at IS NULL",
    )
    .bind(pull_request_id)
    .fetch_one(&state.pool)
    .await?)
}

async fn issue_activity_count(state: &AppState, issue_id: uuid::Uuid) -> ApiResult<i64> {
    Ok(
        sqlx::query_scalar("SELECT COUNT(*)::BIGINT FROM timeline_events WHERE issue_id = $1")
            .bind(issue_id)
            .fetch_one(&state.pool)
            .await?,
    )
}

async fn pull_request_activity_count(state: &AppState, pull_request_id: i64) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM timeline_events WHERE pull_request_id = $1",
    )
    .bind(pull_request_id)
    .fetch_one(&state.pool)
    .await?)
}

struct PreviewAuthorIdentity {
    avatar_url: Option<String>,
    avatar_fallback: String,
}

async fn author_identity(state: &AppState, handle: &str) -> ApiResult<PreviewAuthorIdentity> {
    let user: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT display_name, avatar_url FROM users WHERE username = $1")
            .bind(handle)
            .fetch_optional(&state.pool)
            .await?;
    let (display_name, avatar_url) = user.unwrap_or_else(|| (handle.to_string(), None));

    Ok(PreviewAuthorIdentity {
        avatar_url,
        avatar_fallback: avatar_fallback(&display_name),
    })
}

fn title_case_status(status: &str) -> String {
    let mut chars = status.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
        None => "Open".to_string(),
    }
}

fn numbered_title(number: i64, title: &str) -> String {
    let title = title.trim();
    let prefix = format!("#{number}");
    if title.starts_with(&prefix) {
        title.to_string()
    } else {
        format!("{prefix} {title}")
    }
}

fn png_response(png: Vec<u8>) -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (
                header::CACHE_CONTROL,
                "public, max-age=14400, stale-while-revalidate=86400",
            ),
        ],
        png,
    )
        .into_response()
}

fn dev_png_response(png: Vec<u8>) -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        png,
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub(crate) struct DevSocialPreviewQuery {
    preview_type: Option<String>,
    owner: Option<String>,
    title: Option<String>,
    description: Option<String>,
    avatar_url: Option<String>,
    avatar_fallback: Option<String>,
    website_label: Option<String>,
    number: Option<i64>,
    status: Option<String>,
    comments: Option<i64>,
    activity: Option<i64>,
    source_branch: Option<String>,
    target_branch: Option<String>,
    contributors: Option<i64>,
    issues: Option<i64>,
    pull_requests: Option<i64>,
    discussions: Option<i64>,
    stars: Option<i64>,
    forks: Option<i64>,
}
