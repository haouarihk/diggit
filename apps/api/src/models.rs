use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct User {
    pub(crate) id: Uuid,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) actor_url: String,
    pub(crate) inbox_url: String,
    pub(crate) outbox_url: String,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct UserResponse {
    pub(crate) id: Uuid,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) actor_url: String,
    pub(crate) inbox_url: String,
    pub(crate) outbox_url: String,
    pub(crate) is_admin: bool,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct Repository {
    pub(crate) id: Uuid,
    pub(crate) namespace_id: Option<Uuid>,
    pub(crate) owner_id: Option<Uuid>,
    pub(crate) owner_handle: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) visibility: String,
    pub(crate) default_branch: String,
    pub(crate) issues_enabled: bool,
    pub(crate) pull_requests_enabled: bool,
    pub(crate) pull_request_policy: String,
    pub(crate) archived_at: Option<DateTime<Utc>>,
    pub(crate) dominant_language: String,
    pub(crate) stars_count: i32,
    pub(crate) local_path: String,
    pub(crate) remote_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) source_repository_id: Option<Uuid>,
    pub(crate) source_remote_url: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryOwnerResponse {
    pub(crate) handle: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) kind: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct RepositorySourceResponse {
    pub(crate) owner_handle: String,
    pub(crate) name: String,
    pub(crate) url: String,
    pub(crate) kind: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryResponse {
    pub(crate) id: Uuid,
    pub(crate) namespace_id: Option<Uuid>,
    pub(crate) owner_id: Option<Uuid>,
    pub(crate) owner_handle: String,
    pub(crate) owner: RepositoryOwnerResponse,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) visibility: String,
    pub(crate) default_branch: String,
    pub(crate) issues_enabled: bool,
    pub(crate) pull_requests_enabled: bool,
    pub(crate) pull_request_policy: String,
    pub(crate) archived_at: Option<DateTime<Utc>>,
    pub(crate) dominant_language: String,
    pub(crate) stars_count: i32,
    pub(crate) viewer_has_starred: bool,
    pub(crate) forks_count: i64,
    pub(crate) local_path: String,
    pub(crate) remote_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) source_repository_id: Option<Uuid>,
    pub(crate) source_remote_url: Option<String>,
    pub(crate) source_url: Option<String>,
    pub(crate) source_repository: Option<RepositorySourceResponse>,
    pub(crate) ssh_url: String,
    pub(crate) http_url: String,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryCommitResponse {
    pub(crate) sha: String,
    pub(crate) message: String,
    pub(crate) author_name: String,
    pub(crate) author_email: String,
    pub(crate) author_username: Option<String>,
    pub(crate) author_avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryCommitListResponse {
    pub(crate) data: Vec<RepositoryCommitResponse>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct RepositoryStatsResponse {
    pub(crate) commits_count: i64,
    pub(crate) branches_count: i64,
    pub(crate) tags_count: i64,
    pub(crate) releases_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryBranchResponse {
    pub(crate) name: String,
    pub(crate) is_default: bool,
    pub(crate) commit_sha: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryTagResponse {
    pub(crate) name: String,
    pub(crate) commit_sha: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryBranchListResponse {
    pub(crate) data: Vec<RepositoryBranchResponse>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct RepositoryLanguageResponse {
    pub(crate) language: String,
    pub(crate) bytes: i64,
    pub(crate) percentage: f64,
    pub(crate) color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct RepositoryLanguageListResponse {
    pub(crate) data: Vec<RepositoryLanguageResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryContributorResponse {
    pub(crate) name: String,
    pub(crate) username: Option<String>,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) commits: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryContributorListResponse {
    pub(crate) data: Vec<RepositoryContributorResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryTagListResponse {
    pub(crate) data: Vec<RepositoryTagResponse>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct Release {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Uuid,
    pub(crate) tag_name: String,
    pub(crate) target_commit_sha: String,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) body_html: String,
    pub(crate) author_actor_url: String,
    pub(crate) author_handle: String,
    pub(crate) author_display_name: String,
    pub(crate) status: String,
    pub(crate) is_prerelease: bool,
    pub(crate) activity_id: Option<String>,
    pub(crate) published_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct ReleaseAsset {
    pub(crate) id: Uuid,
    pub(crate) release_id: Uuid,
    pub(crate) uploaded_by_actor_url: String,
    pub(crate) runner_id: Option<Uuid>,
    pub(crate) original_filename: String,
    pub(crate) content_type: String,
    pub(crate) byte_size: i64,
    pub(crate) sha256: String,
    pub(crate) storage_key: String,
    pub(crate) download_count: i64,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReleaseAssetResponse {
    pub(crate) id: Uuid,
    pub(crate) filename: String,
    #[serde(rename = "contentType")]
    pub(crate) content_type: String,
    pub(crate) size: i64,
    pub(crate) sha256: String,
    pub(crate) url: String,
    pub(crate) markdown: String,
    #[serde(rename = "isImage")]
    pub(crate) is_image: bool,
    pub(crate) download_count: i64,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReleaseResponse {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Uuid,
    pub(crate) tag_name: String,
    pub(crate) target_commit_sha: String,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) body_html: String,
    pub(crate) author_actor_url: String,
    pub(crate) author_handle: String,
    pub(crate) author_display_name: String,
    pub(crate) status: String,
    pub(crate) is_prerelease: bool,
    pub(crate) activity_id: Option<String>,
    pub(crate) assets: Vec<ReleaseAssetResponse>,
    pub(crate) reactions: Vec<CommentReactionResponse>,
    pub(crate) last_commit: Option<RepositoryCommitResponse>,
    pub(crate) viewer_can_update: bool,
    pub(crate) published_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryDiffLineResponse {
    pub(crate) kind: String,
    pub(crate) old_line: Option<i32>,
    pub(crate) new_line: Option<i32>,
    pub(crate) content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryDiffHunkResponse {
    pub(crate) header: String,
    pub(crate) lines: Vec<RepositoryDiffLineResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryDiffFileResponse {
    pub(crate) old_path: Option<String>,
    pub(crate) new_path: Option<String>,
    pub(crate) status: String,
    pub(crate) additions: i32,
    pub(crate) deletions: i32,
    pub(crate) hunks: Vec<RepositoryDiffHunkResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryCommitDetailResponse {
    pub(crate) commit: RepositoryCommitResponse,
    pub(crate) parents: Vec<String>,
    pub(crate) files: Vec<RepositoryDiffFileResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryCompareResponse {
    pub(crate) status: String,
    pub(crate) source: Option<RepositorySourceResponse>,
    pub(crate) ahead_by: i32,
    pub(crate) behind_by: i32,
    pub(crate) ahead_commits: Vec<RepositoryCommitResponse>,
    pub(crate) behind_commits: Vec<RepositoryCommitResponse>,
    pub(crate) files: Vec<RepositoryDiffFileResponse>,
    pub(crate) message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryTreeEntryResponse {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: String,
    pub(crate) size: Option<i64>,
    pub(crate) extension: Option<String>,
    pub(crate) last_commit: Option<RepositoryCommitResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryTreeResponse {
    pub(crate) ref_name: String,
    pub(crate) last_commit: Option<RepositoryCommitResponse>,
    pub(crate) entries: Vec<RepositoryTreeEntryResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryFileResponse {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) size: i64,
    pub(crate) extension: Option<String>,
    pub(crate) content: String,
    pub(crate) is_binary: bool,
    pub(crate) media_type: String,
    pub(crate) last_commit: Option<RepositoryCommitResponse>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct Organization {
    pub(crate) id: Uuid,
    pub(crate) name: String,
    pub(crate) display_name: String,
    pub(crate) description: String,
    pub(crate) created_by: Uuid,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct Namespace {
    pub(crate) id: Uuid,
    pub(crate) name: String,
    pub(crate) kind: String,
    pub(crate) user_id: Option<Uuid>,
    pub(crate) organization_id: Option<Uuid>,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct PullRequest {
    pub(crate) id: i64,
    pub(crate) legacy_uuid: Option<Uuid>,
    pub(crate) target_repository_id: Uuid,
    pub(crate) source_repository_id: Option<Uuid>,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) author_handle: String,
    pub(crate) source_repo_url: String,
    pub(crate) source_branch: String,
    pub(crate) target_branch: String,
    pub(crate) status: String,
    pub(crate) activity_id: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct PullRequestResponse {
    pub(crate) id: i64,
    pub(crate) target_repository_id: Uuid,
    pub(crate) source_repository_id: Option<Uuid>,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) author_handle: String,
    pub(crate) source_repo_url: String,
    pub(crate) source_branch: String,
    pub(crate) target_branch: String,
    pub(crate) status: String,
    pub(crate) activity_id: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
    pub(crate) viewer_can_update: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct PullRequestSourceOptionResponse {
    pub(crate) repository_id: Option<Uuid>,
    pub(crate) owner_handle: String,
    pub(crate) name: String,
    pub(crate) url: String,
    pub(crate) kind: String,
    pub(crate) branches: Vec<RepositoryBranchResponse>,
}

#[derive(Debug, Serialize)]
pub(crate) struct PullRequestOptionsResponse {
    pub(crate) repository: PullRequestSourceOptionResponse,
    pub(crate) forks: Vec<PullRequestSourceOptionResponse>,
    pub(crate) upstream: Option<PullRequestSourceOptionResponse>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct Issue {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Uuid,
    pub(crate) number: i32,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) author_handle: String,
    pub(crate) author_actor_url: Option<String>,
    pub(crate) author_display_name: String,
    pub(crate) author_avatar_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) remote_url: Option<String>,
    pub(crate) status: String,
    pub(crate) labels: Value,
    pub(crate) activity_id: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct IssueComment {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Option<Uuid>,
    pub(crate) pull_request_id: Option<i64>,
    pub(crate) pull_request_uuid: Option<Uuid>,
    pub(crate) issue_id: Option<Uuid>,
    pub(crate) author_handle: String,
    pub(crate) author_actor_url: Option<String>,
    pub(crate) author_display_name: String,
    pub(crate) author_avatar_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) body: String,
    pub(crate) activity_id: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
    pub(crate) deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub(crate) struct CommentReactionResponse {
    pub(crate) emoji: String,
    pub(crate) count: i64,
    pub(crate) viewer_reacted: bool,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct CommentAttachment {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Uuid,
    pub(crate) comment_id: Option<Uuid>,
    pub(crate) uploaded_by_actor_url: String,
    pub(crate) original_filename: String,
    pub(crate) content_type: String,
    pub(crate) byte_size: i64,
    pub(crate) sha256: String,
    pub(crate) storage_key: String,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) attached_at: Option<DateTime<Utc>>,
    pub(crate) deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub(crate) struct CommentAttachmentResponse {
    pub(crate) id: Uuid,
    pub(crate) filename: String,
    #[serde(rename = "contentType")]
    pub(crate) content_type: String,
    pub(crate) size: i64,
    pub(crate) url: String,
    pub(crate) markdown: String,
    #[serde(rename = "isImage")]
    pub(crate) is_image: bool,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct CommentResponse {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Option<Uuid>,
    pub(crate) pull_request_id: Option<i64>,
    pub(crate) issue_id: Option<Uuid>,
    pub(crate) author_handle: String,
    pub(crate) author_actor_url: Option<String>,
    pub(crate) author_display_name: String,
    pub(crate) author_avatar_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) body: String,
    pub(crate) body_html: String,
    pub(crate) activity_id: Option<String>,
    pub(crate) reactions: Vec<CommentReactionResponse>,
    pub(crate) attachments: Vec<CommentAttachmentResponse>,
    pub(crate) viewer_can_update: bool,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
    pub(crate) deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct TimelineEvent {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Uuid,
    pub(crate) issue_id: Option<Uuid>,
    pub(crate) pull_request_id: Option<i64>,
    pub(crate) actor_handle: String,
    pub(crate) actor_actor_url: Option<String>,
    pub(crate) actor_display_name: String,
    pub(crate) actor_avatar_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) event_type: String,
    pub(crate) body: String,
    pub(crate) metadata: Value,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct TimelineEventResponse {
    pub(crate) id: Uuid,
    pub(crate) event_type: String,
    pub(crate) body: String,
    pub(crate) actor_handle: String,
    pub(crate) actor_actor_url: Option<String>,
    pub(crate) actor_display_name: String,
    pub(crate) actor_avatar_url: Option<String>,
    pub(crate) remote_server: Option<String>,
    pub(crate) metadata: Value,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ActivityItemResponse {
    pub(crate) kind: String,
    pub(crate) comment: Option<CommentResponse>,
    pub(crate) event: Option<TimelineEventResponse>,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct Pagination {
    pub(crate) page: i64,
    pub(crate) limit: i64,
    pub(crate) total: i64,
    #[serde(rename = "totalPages")]
    pub(crate) total_pages: i64,
}

#[derive(Debug, Serialize)]
pub(crate) struct PaginatedResponse<T> {
    pub(crate) data: Vec<T>,
    pub(crate) pagination: Pagination,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct ServerPolicy {
    pub(crate) id: Uuid,
    pub(crate) host: String,
    pub(crate) status: String,
    pub(crate) reason: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct ActivityRow {
    pub(crate) id: Uuid,
    pub(crate) direction: String,
    pub(crate) remote_server: Option<String>,
    pub(crate) actor: String,
    pub(crate) activity_type: String,
    pub(crate) object_type: String,
    pub(crate) activity_id: String,
    pub(crate) payload: Value,
    pub(crate) status: String,
    pub(crate) error: Option<String>,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct SshKey {
    pub(crate) id: Uuid,
    pub(crate) user_id: Uuid,
    pub(crate) title: String,
    pub(crate) public_key: String,
    pub(crate) fingerprint: String,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct Runner {
    pub(crate) id: Uuid,
    pub(crate) scope_kind: String,
    pub(crate) user_id: Option<Uuid>,
    pub(crate) organization_id: Option<Uuid>,
    pub(crate) repository_id: Option<Uuid>,
    pub(crate) name: String,
    pub(crate) labels: Vec<String>,
    pub(crate) version: Option<String>,
    pub(crate) status: String,
    pub(crate) last_seen_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct OAuthApplication {
    pub(crate) id: Uuid,
    pub(crate) owner_id: Uuid,
    pub(crate) name: String,
    pub(crate) redirect_uri: String,
    pub(crate) scopes: Vec<String>,
    pub(crate) client_secret_hash: String,
    pub(crate) revoked_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct RepositoryWebhook {
    pub(crate) id: Uuid,
    pub(crate) repository_id: Uuid,
    pub(crate) url: String,
    pub(crate) secret: Option<String>,
    pub(crate) events: Vec<String>,
    pub(crate) active: bool,
    pub(crate) push_events_branch_filter: Option<String>,
    pub(crate) branch_filter_strategy: Option<String>,
    pub(crate) last_status: Option<String>,
    pub(crate) last_status_code: Option<i32>,
    pub(crate) last_error: Option<String>,
    pub(crate) last_delivered_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Claims {
    pub(crate) sub: Uuid,
    pub(crate) username: String,
    pub(crate) exp: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct AuthUser {
    pub(crate) id: Uuid,
    pub(crate) username: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct FederatedIdentityClaims {
    pub(crate) iss: String,
    pub(crate) sub: String,
    pub(crate) preferred_username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) aud: String,
    pub(crate) scope: String,
    pub(crate) exp: usize,
    pub(crate) iat: usize,
    pub(crate) nonce: String,
    pub(crate) jti: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct FederatedSessionClaims {
    pub(crate) iss: String,
    pub(crate) sub: String,
    pub(crate) preferred_username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) aud: String,
    pub(crate) home_server: String,
    pub(crate) scope: String,
    pub(crate) exp: usize,
    pub(crate) iat: usize,
    pub(crate) nonce: String,
    pub(crate) jti: String,
}

#[derive(Debug)]
pub(crate) struct FederatedAuthUser {
    pub(crate) actor_url: String,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) home_server: String,
    pub(crate) scopes: Vec<String>,
}

#[derive(Debug)]
pub(crate) enum RepoActionAuth {
    Local(AuthUser),
    Federated(FederatedAuthUser),
}

#[derive(Debug, Deserialize)]
pub(crate) struct RegisterRequest {
    pub(crate) username: String,
    pub(crate) display_name: Option<String>,
    pub(crate) password: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LoginRequest {
    pub(crate) username: String,
    pub(crate) password: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct AuthResponse {
    pub(crate) token: String,
    pub(crate) user: UserResponse,
}

#[derive(Debug, Serialize)]
pub(crate) struct CurrentUserResponse {
    pub(crate) id: Option<Uuid>,
    pub(crate) kind: String,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) actor_url: String,
    pub(crate) inbox_url: Option<String>,
    pub(crate) outbox_url: Option<String>,
    pub(crate) is_admin: bool,
    pub(crate) home_server: Option<String>,
    pub(crate) capabilities: Vec<String>,
    pub(crate) created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FederatedAuthorizeRequest {
    pub(crate) client_id: String,
    pub(crate) redirect_uri: String,
    pub(crate) audience: String,
    pub(crate) scope: String,
    pub(crate) state: String,
    pub(crate) nonce: String,
    pub(crate) code_challenge: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct FederatedAuthorizeResponse {
    pub(crate) code: String,
    pub(crate) redirect_uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct FederatedTokenRequest {
    pub(crate) code: String,
    pub(crate) client_id: String,
    pub(crate) redirect_uri: String,
    pub(crate) code_verifier: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct FederatedTokenResponse {
    pub(crate) identity_token: String,
    pub(crate) token_type: String,
    pub(crate) expires_in: i64,
    pub(crate) issuer: String,
    pub(crate) audience: String,
    pub(crate) actor_url: String,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) scope: String,
    pub(crate) nonce: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FederatedExchangeRequest {
    pub(crate) home_server: String,
    pub(crate) code: String,
    pub(crate) client_id: String,
    pub(crate) redirect_uri: String,
    pub(crate) code_verifier: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct FederatedExchangeResponse {
    pub(crate) token: String,
    pub(crate) home_token: String,
    pub(crate) expires_at: DateTime<Utc>,
    pub(crate) user: CurrentUserResponse,
}

#[derive(Debug, Serialize)]
pub(crate) struct DiggitDiscoveryResponse {
    pub(crate) issuer: String,
    pub(crate) authorization_endpoint: String,
    pub(crate) token_endpoint: String,
    pub(crate) jwks_uri: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct FederatedForkRequest {
    pub(crate) source_repo_url: String,
    pub(crate) name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateSshKeyRequest {
    pub(crate) title: String,
    pub(crate) public_key: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct OAuthApplicationResponse {
    pub(crate) id: Uuid,
    pub(crate) client_id: String,
    pub(crate) name: String,
    pub(crate) redirect_uri: String,
    pub(crate) scopes: Vec<String>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct CreatedOAuthApplicationResponse {
    pub(crate) application: OAuthApplicationResponse,
    pub(crate) client_secret: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct OAuthTokenResponse {
    pub(crate) id: Uuid,
    pub(crate) application_id: Uuid,
    pub(crate) application_name: String,
    pub(crate) scopes: Vec<String>,
    pub(crate) expires_at: DateTime<Utc>,
    pub(crate) revoked_at: Option<DateTime<Utc>>,
    pub(crate) last_used_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateOAuthApplicationRequest {
    pub(crate) name: String,
    pub(crate) redirect_uri: String,
    pub(crate) scopes: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateOAuthApplicationRequest {
    pub(crate) name: Option<String>,
    pub(crate) redirect_uri: Option<String>,
    pub(crate) scopes: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RotatedOAuthApplicationSecretResponse {
    pub(crate) application: OAuthApplicationResponse,
    pub(crate) client_secret: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OAuthAuthorizeQuery {
    pub(crate) client_id: String,
    pub(crate) redirect_uri: String,
    pub(crate) response_type: Option<String>,
    pub(crate) scope: Option<String>,
    pub(crate) scopes: Option<String>,
    pub(crate) state: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OAuthAuthorizeForm {
    pub(crate) client_id: String,
    pub(crate) redirect_uri: String,
    pub(crate) response_type: Option<String>,
    pub(crate) scope: Option<String>,
    pub(crate) scopes: Option<String>,
    pub(crate) state: Option<String>,
    pub(crate) username: Option<String>,
    pub(crate) password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct OAuthTokenRequest {
    pub(crate) grant_type: String,
    pub(crate) code: Option<String>,
    pub(crate) refresh_token: Option<String>,
    pub(crate) client_id: String,
    pub(crate) client_secret: String,
    pub(crate) redirect_uri: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct OAuthTokenIssueResponse {
    pub(crate) access_token: String,
    pub(crate) token_type: String,
    pub(crate) expires_in: i64,
    pub(crate) refresh_token: String,
    pub(crate) scope: String,
    pub(crate) created_at: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GitlabPageQuery {
    pub(crate) membership: Option<bool>,
    pub(crate) page: Option<i64>,
    pub(crate) per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateRepositoryWebhookRequest {
    pub(crate) url: String,
    pub(crate) secret: Option<String>,
    pub(crate) events: Option<Vec<String>>,
    pub(crate) push_events_branch_filter: Option<String>,
    pub(crate) branch_filter_strategy: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateGitlabProjectHookRequest {
    pub(crate) url: String,
    pub(crate) token: Option<String>,
    pub(crate) push_events: Option<bool>,
    pub(crate) tag_push_events: Option<bool>,
    pub(crate) issues_events: Option<bool>,
    pub(crate) confidential_issues_events: Option<bool>,
    pub(crate) merge_requests_events: Option<bool>,
    pub(crate) note_events: Option<bool>,
    pub(crate) confidential_note_events: Option<bool>,
    pub(crate) job_events: Option<bool>,
    pub(crate) pipeline_events: Option<bool>,
    pub(crate) wiki_page_events: Option<bool>,
    pub(crate) deployment_events: Option<bool>,
    pub(crate) releases_events: Option<bool>,
    pub(crate) resource_access_token_events: Option<bool>,
    pub(crate) repository_update_events: Option<bool>,
    pub(crate) emoji_events: Option<bool>,
    pub(crate) active: Option<bool>,
    pub(crate) enable_ssl_verification: Option<bool>,
    pub(crate) push_events_branch_filter: Option<String>,
    pub(crate) branch_filter_strategy: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RepositoryWebhookResponse {
    pub(crate) id: Uuid,
    pub(crate) url: String,
    pub(crate) events: Vec<String>,
    pub(crate) active: bool,
    pub(crate) push_events_branch_filter: Option<String>,
    pub(crate) branch_filter_strategy: Option<String>,
    pub(crate) last_status: Option<String>,
    pub(crate) last_status_code: Option<i32>,
    pub(crate) last_error: Option<String>,
    pub(crate) last_delivered_at: Option<DateTime<Utc>>,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RunnerTokenResponse {
    pub(crate) token: String,
    pub(crate) scope: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RegisterRunnerRequest {
    pub(crate) token: String,
    pub(crate) name: Option<String>,
    pub(crate) labels: Option<String>,
    pub(crate) version: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RegisterRunnerResponse {
    pub(crate) id: Uuid,
    pub(crate) token: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateRepoRequest {
    pub(crate) name: String,
    pub(crate) owner: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateRepoSettingsRequest {
    pub(crate) name: Option<String>,
    pub(crate) default_branch: Option<String>,
    pub(crate) visibility: Option<String>,
    pub(crate) issues_enabled: Option<bool>,
    pub(crate) pull_requests_enabled: Option<bool>,
    pub(crate) pull_request_policy: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct TransferRepoRequest {
    pub(crate) owner: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ArchiveRepoRequest {
    pub(crate) archived: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateOrganizationRequest {
    pub(crate) name: String,
    pub(crate) display_name: Option<String>,
    pub(crate) description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateOrganizationRequest {
    pub(crate) display_name: Option<String>,
    pub(crate) description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpsertCollaboratorRequest {
    pub(crate) username: String,
    pub(crate) role: Option<String>,
    pub(crate) permission: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpsertRunnerSecretRequest {
    pub(crate) name: String,
    pub(crate) value: String,
    pub(crate) environment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpsertRunnerVariableRequest {
    pub(crate) name: String,
    pub(crate) value: String,
    pub(crate) environment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateReleaseRequest {
    pub(crate) tag_name: String,
    pub(crate) target_ref: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) body: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) is_prerelease: Option<bool>,
    pub(crate) generate_notes: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateReleaseRequest {
    pub(crate) title: Option<String>,
    pub(crate) body: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) is_prerelease: Option<bool>,
    pub(crate) generate_notes: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ForkRepoRequest {
    pub(crate) name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreatePullRequestRequest {
    pub(crate) title: String,
    pub(crate) body: Option<String>,
    pub(crate) source_repo_url: String,
    pub(crate) source_branch: String,
    pub(crate) target_branch: Option<String>,
    pub(crate) source_repository_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ComparePullRequestRequest {
    pub(crate) source_repo_url: String,
    pub(crate) source_branch: String,
    pub(crate) target_branch: Option<String>,
    pub(crate) source_repository_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdatePullRequestRequest {
    pub(crate) status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateIssueRequest {
    pub(crate) title: String,
    pub(crate) body: Option<String>,
    pub(crate) labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateIssueRequest {
    pub(crate) title: Option<String>,
    pub(crate) body: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpsertIssueLabelRequest {
    pub(crate) name: String,
    pub(crate) color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CreateIssueCommentRequest {
    pub(crate) body: String,
    pub(crate) attachment_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateCommentRequest {
    pub(crate) body: String,
    pub(crate) attachment_ids: Option<Vec<Uuid>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CommentReactionRequest {
    pub(crate) emoji: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateRepoFileRequest {
    pub(crate) content: String,
    pub(crate) message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpsertServerRequest {
    pub(crate) host: String,
    pub(crate) status: String,
    pub(crate) reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepoListQuery {
    pub(crate) q: Option<String>,
    pub(crate) sort: Option<String>,
    pub(crate) direction: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepoTreeQuery {
    #[serde(rename = "ref")]
    pub(crate) ref_name: Option<String>,
    pub(crate) path: Option<String>,
    pub(crate) recursive: Option<bool>,
    pub(crate) include_last_commit: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepoRefQuery {
    #[serde(rename = "ref")]
    pub(crate) ref_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CommitListQuery {
    #[serde(rename = "ref")]
    pub(crate) ref_name: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct IssueListQuery {
    pub(crate) page: Option<i64>,
    pub(crate) limit: Option<i64>,
    pub(crate) status: Option<String>,
    pub(crate) q: Option<String>,
    pub(crate) labels: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReleaseListQuery {
    pub(crate) page: Option<i64>,
    pub(crate) limit: Option<i64>,
    pub(crate) status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepoFileQuery {
    pub(crate) path: String,
    #[serde(rename = "ref")]
    pub(crate) ref_name: Option<String>,
    pub(crate) message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WebfingerQuery {
    pub(crate) resource: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SearchQuery {
    pub(crate) q: Option<String>,
    #[serde(rename = "type")]
    pub(crate) search_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct SearchUserResult {
    pub(crate) id: Uuid,
    pub(crate) username: String,
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_fallback: String,
    pub(crate) is_admin: bool,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Activity {
    #[serde(default)]
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) activity_type: String,
    #[serde(default)]
    pub(crate) actor: String,
    #[serde(default)]
    pub(crate) object: Value,
}
