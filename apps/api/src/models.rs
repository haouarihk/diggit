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
    pub(crate) dominant_language: String,
    pub(crate) stars_count: i32,
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
    pub(crate) avatar_fallback: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RepositoryCommitListResponse {
    pub(crate) data: Vec<RepositoryCommitResponse>,
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
pub(crate) struct OrganizationMember {
    pub(crate) organization_id: Uuid,
    pub(crate) user_id: Uuid,
    pub(crate) role: String,
    pub(crate) created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub(crate) struct PullRequest {
    pub(crate) id: Uuid,
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
pub(crate) struct CreateOrganizationRequest {
    pub(crate) name: String,
    pub(crate) display_name: Option<String>,
    pub(crate) description: Option<String>,
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
}

#[derive(Debug, Deserialize)]
pub(crate) struct CommitListQuery {
    #[serde(rename = "ref")]
    pub(crate) ref_name: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepoFileQuery {
    pub(crate) path: String,
    #[serde(rename = "ref")]
    pub(crate) ref_name: Option<String>,
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
