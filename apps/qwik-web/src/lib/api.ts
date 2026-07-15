import { browserRuntimePublicApiUrl } from "./runtime-config";

export type Repository = {
  id: string;
  owner_handle: string;
  owner?: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
    avatar_fallback: string;
    kind: string;
  };
  name: string;
  description: string;
  visibility: string;
  default_branch: string;
  issues_enabled?: boolean;
  pull_requests_enabled?: boolean;
  pull_request_policy?: "anyone" | "collaborators" | string;
  archived_at?: string | null;
  dominant_language: string;
  ssh_url: string;
  http_url: string;
  stars_count: number;
  viewer_has_starred: boolean;
  forks_count?: number;
  remote_server?: string | null;
  source_repository_id?: string | null;
  source_remote_url?: string | null;
  updated_at: string;
};

export type RepositorySource = {
  owner_handle: string;
  name: string;
  url: string;
  kind: "local" | "remote" | string;
};

export type RepositoryBranch = {
  name: string;
  is_default: boolean;
  commit_sha: string | null;
};

export type RepositoryCommit = {
  sha: string;
  message: string;
  created_at: string;
  author_name: string;
  author_email?: string;
  author_username?: string | null;
  author_avatar_url?: string | null;
  avatar_fallback?: string;
};

export type RepositoryTag = {
  name: string;
  commit_sha: string | null;
};

export type ReleaseAsset = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  url: string;
  markdown: string;
  isImage: boolean;
  download_count: number;
  created_at: string;
};

export type Release = {
  id: string;
  repository_id: string;
  tag_name: string;
  target_commit_sha: string;
  title: string;
  body: string;
  body_html: string;
  author_actor_url: string;
  author_handle: string;
  author_display_name: string;
  status: "draft" | "published" | string;
  is_prerelease: boolean;
  activity_id: string | null;
  assets: ReleaseAsset[];
  reactions: CommentReaction[];
  last_commit: RepositoryCommit | null;
  viewer_can_update: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RepositoryStats = {
  commits_count: number;
  branches_count: number;
  tags_count: number;
  releases_count: number;
};

export type RepositoryLanguage = {
  language: string;
  bytes: number;
  percentage: number;
  color: string;
};

export type RepositoryContributor = {
  name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_fallback: string;
  commits: number;
};

export type RepositoryTreeEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  extension: string | null;
  last_commit: RepositoryCommit | null;
};

export type RepositoryTree = {
  ref_name: string;
  last_commit: RepositoryCommit | null;
  entries: RepositoryTreeEntry[];
};

export type RepositoryFile = {
  name: string;
  path: string;
  size: number;
  extension: string | null;
  content: string;
  is_binary: boolean;
  media_type: string;
  last_commit: RepositoryCommit | null;
};

export type SearchUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_fallback: string;
  created_at?: string;
};

export type CurrentUser = {
  id: string | null;
  kind?: "local" | "federated";
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_fallback: string;
  actor_url?: string;
  home_server?: string | null;
  capabilities?: string[];
  is_admin: boolean;
};

export type SearchResponse = {
  query: string;
  parsed: {
    terms: string[];
    exact_terms: string[];
    regex_terms: string[];
    excluded_terms: string[];
    repo: string | null;
    user: string | null;
    org: string | null;
    is_fork: boolean | null;
    unsupported_qualifiers: string[];
  };
  federated: {
    mode?: string;
    description: string;
  };
  unsupportedTypes?: string[];
  data: {
    repositories: Repository[];
    users: SearchUser[];
  };
};

export type Organization = {
  id: string;
  name: string;
  display_name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type RunnerSecret = {
  id: string;
  name: string;
  environment: string | null;
  created_at: string;
  updated_at: string;
};

export type RunnerVariable = RunnerSecret & {
  value: string;
};

export type Collaborator = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  permission?: string;
  role?: string;
  created_at: string;
};

export type IssueLabel = {
  id: string;
  name: string;
  color: string;
};

export type PullRequest = {
  id: number;
  target_repository_id: string;
  source_repository_id: string | null;
  title: string;
  body: string;
  author_handle: string;
  source_repo_url: string;
  source_branch: string;
  target_branch: string;
  status: "open" | "closed" | "merged" | string;
  labels: IssueLabel[];
  activity_id: string | null;
  created_at: string;
  updated_at: string;
  viewer_can_update: boolean;
};

export type PullRequestSourceOption = {
  repository_id: string | null;
  owner_handle: string;
  name: string;
  url: string;
  kind: "repository" | "fork" | "upstream" | string;
  branches: RepositoryBranch[];
};

export type PullRequestOptions = {
  repository: PullRequestSourceOption;
  forks: PullRequestSourceOption[];
  upstream: PullRequestSourceOption | null;
};

export type PullRequestCompareInput = {
  source_repo_url: string;
  source_branch: string;
  source_repository_id?: string | null;
  target_branch: string;
};

export type Issue = {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  body: string;
  author_handle: string;
  author_actor_url: string | null;
  author_display_name: string;
  author_avatar_url: string | null;
  remote_server: string | null;
  remote_url: string | null;
  status: "open" | "closed";
  labels: IssueLabel[];
  activity_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentReaction = {
  emoji: string;
  count: number;
  viewer_reacted: boolean;
};

export type CommentAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  markdown: string;
  isImage: boolean;
  created_at: string;
};

export type IssueComment = {
  id: string;
  repository_id: string | null;
  pull_request_id: number | null;
  issue_id: string | null;
  author_handle: string;
  author_actor_url: string | null;
  author_display_name: string;
  author_avatar_url: string | null;
  remote_server: string | null;
  body: string;
  body_html: string;
  activity_id: string | null;
  reactions: CommentReaction[];
  attachments: CommentAttachment[];
  viewer_can_update: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PullRequestComment = IssueComment;

export type TimelineEvent = {
  id: string;
  event_type: "opened" | "closed" | "reopened" | "merged" | "renamed" | string;
  body: string;
  actor_handle: string;
  actor_actor_url: string | null;
  actor_display_name: string;
  actor_avatar_url: string | null;
  remote_server: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ActivityItem =
  | {
      kind: "comment";
      comment: IssueComment;
      event: null;
      created_at: string;
    }
  | {
      kind: "event";
      comment: null;
      event: TimelineEvent;
      created_at: string;
    };

export type RepositoryDiffLine = {
  kind: "addition" | "context" | "deletion";
  old_line: number | null;
  new_line: number | null;
  content: string;
};

export type RepositoryDiffHunk = {
  header: string;
  lines: RepositoryDiffLine[];
};

export type RepositoryDiffFile = {
  old_path: string | null;
  new_path: string | null;
  status: string;
  additions: number;
  deletions: number;
  hunks: RepositoryDiffHunk[];
};

export type RepositoryCommitDetail = {
  commit: RepositoryCommit;
  parents: string[];
  files: RepositoryDiffFile[];
};

export type RepositoryCompare = {
  status:
    | "up_to_date"
    | "ahead"
    | "behind"
    | "diverged"
    | "unavailable"
    | string;
  source: RepositorySource | null;
  ahead_by: number;
  behind_by: number;
  ahead_commits: RepositoryCommit[];
  behind_commits: RepositoryCommit[];
  files: RepositoryDiffFile[];
  message: string | null;
};

export type ServerPolicy = {
  id: string;
  host: string;
  status: "allowed" | "blocked" | "pending";
  reason: string | null;
};

export type Activity = {
  id: string;
  direction: "inbound" | "outbound";
  remote_server: string | null;
  actor: string;
  activity_type: string;
  object_type: string;
  status: string;
  created_at: string;
};

type Collection<T> = {
  data: T[];
};

export type ApiAuthOptions = {
  authToken?: string | null;
  forwardedHeaders?: HeadersInit;
};

export type PaginatedCollection<T> = Collection<T> & {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_API_URL = "http://localhost:3001";

export class ApiRequestError extends Error {
  status: number;
  path: string;
  retryAfterSeconds: number | null;

  constructor(
    status: number,
    path: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(`API request failed: ${status} ${path}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.path = path;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function serverApiBaseUrl() {
  return normalizeApiUrl(
    runtimeEnv("API_INTERNAL_URL") ??
      runtimeEnv("APP_BASE_URL") ??
      runtimeEnv("PUBLIC_API_URL"),
  );
}

export function publicApiBaseUrl() {
  const configuredUrl =
    browserRuntimePublicApiUrl() ??
    import.meta.env.PUBLIC_API_URL ??
    runtimeEnv("PUBLIC_API_URL") ??
    runtimeEnv("APP_BASE_URL");

  if (configuredUrl) {
    return normalizeApiUrl(configuredUrl);
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

export async function listRepositories() {
  return fetchServerApi<Collection<Repository>>("/repos");
}

export async function searchRepositories(query: string, type: string) {
  return fetchServerApi<SearchResponse>(
    `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`,
  );
}

export async function getRepository(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Repository>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    undefined,
    options,
  );
}

export async function getOrganization(org: string) {
  return fetchServerApi<Organization>(`/organizations/${encodeURIComponent(org)}`);
}

export async function getUser(username: string) {
  return fetchServerApi<CurrentUser>(`/users/${encodeURIComponent(username)}`);
}

export async function listOrganizationMembers(org: string) {
  return fetchServerApi<Collection<Collaborator>>(
    `/organizations/${encodeURIComponent(org)}/members`,
  );
}

export async function listOrganizationRepositories(
  org: string,
  params?: { q?: string; sort?: string; direction?: string },
  options?: ApiAuthOptions,
) {
  const searchParams = collectionParams(params);
  return fetchServerApi<Collection<Repository>>(
    `/organizations/${encodeURIComponent(org)}/repos${searchParams}`,
    undefined,
    options,
  );
}

export async function listRepositoryBranches(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Collection<RepositoryBranch>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`,
    undefined,
    options,
  );
}

export async function listRepositoryTags(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Collection<RepositoryTag>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tags`,
    undefined,
    options,
  );
}

export async function listReleases(
  owner: string,
  name: string,
  params?: {
    limit?: number;
    page?: number;
    prerelease?: boolean;
    q?: string;
    status?: "draft" | "published" | "all";
    tag?: string;
  },
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams();
  if (params?.page) {
    searchParams.set("page", String(params.page));
  }
  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.q) {
    searchParams.set("q", params.q);
  }
  if (params?.tag) {
    searchParams.set("tag", params.tag);
  }
  if (params?.prerelease) {
    searchParams.set("prerelease", "true");
  }
  const query = searchParams.toString();
  return fetchServerApi<PaginatedCollection<Release>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases${query ? `?${query}` : ""}`,
    undefined,
    options,
  );
}

export async function getRelease(
  owner: string,
  name: string,
  tag: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Release>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(tag)}`,
    undefined,
    options,
  );
}

export async function compareRefs(owner: string, name: string, range: string) {
  return fetchServerApi<RepositoryCompare>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare/${encodeURIComponent(range)}`,
  );
}

export async function getRepositoryStats(
  owner: string,
  name: string,
  refName?: string,
  options?: ApiAuthOptions,
) {
    const searchParams = new URLSearchParams();
    if (refName) {
      searchParams.set("ref", refName);
    }
    const query = searchParams.toString();
    return fetchServerApi<RepositoryStats>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/stats${query ? `?${query}` : ""}`,
      undefined,
      options,
    );
}

export async function listRepositoryLanguages(
  owner: string,
  name: string,
  refName?: string,
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return fetchServerApi<Collection<RepositoryLanguage>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages${query ? `?${query}` : ""}`,
    undefined,
    options,
  );
}

export async function listRepositoryContributors(
  owner: string,
  name: string,
  refName?: string,
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return fetchServerApi<Collection<RepositoryContributor>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contributors${query ? `?${query}` : ""}`,
    undefined,
    options,
  );
}

export async function listRepositoryCollaborators(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Collection<Collaborator>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/collaborators`,
    undefined,
    options,
  );
}

export async function getRepositoryTree(
  owner: string,
  name: string,
  refName?: string,
  path?: string,
  options: {
    authToken?: string | null;
    includeLastCommit?: boolean;
    recursive?: boolean;
  } = {},
) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  if (path) {
    searchParams.set("path", path);
  }
  if (options.recursive) {
    searchParams.set("recursive", "true");
  }
  if (options.includeLastCommit === false) {
    searchParams.set("include_last_commit", "false");
  }
  const query = searchParams.toString();
  return fetchServerApi<RepositoryTree>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree${query ? `?${query}` : ""}`,
    undefined,
    { authToken: options.authToken },
  );
}

export async function getRepositoryFile(
  owner: string,
  name: string,
  path: string,
  refName?: string,
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams({ path });
  if (refName) {
    searchParams.set("ref", refName);
  }
  return fetchServerApi<RepositoryFile>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${searchParams.toString()}`,
    undefined,
    options,
  );
}

export async function listCommits(
  owner: string,
  name: string,
  refName?: string,
  limit?: number,
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  if (limit !== undefined) {
    searchParams.set("limit", String(limit));
  }
  const query = searchParams.toString();
  return fetchServerApi<Collection<RepositoryCommit>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits${query ? `?${query}` : ""}`,
    undefined,
    options,
  );
}

export async function getCommit(owner: string, name: string, sha: string) {
  return fetchServerApi<RepositoryCommitDetail>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(sha)}`,
  );
}

export async function listPullRequests(
  owner: string,
  name: string,
  params?: {
    labels?: string;
    limit?: number;
    page?: number;
    q?: string;
    status?: "all" | "closed" | "merged" | "open";
  },
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params?.page ?? 1));
  searchParams.set("limit", String(params?.limit ?? 1));
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.q) {
    searchParams.set("q", params.q);
  }
  if (params?.labels) {
    searchParams.set("labels", params.labels);
  }
  const query = searchParams.toString();
  return fetchServerApi<PaginatedCollection<PullRequest>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests?${query}`,
    undefined,
    options,
  );
}

export async function getPullRequest(
  owner: string,
  name: string,
  id: number | string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<PullRequest>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${encodeURIComponent(String(id))}`,
    undefined,
    options,
  );
}

export async function getPullRequestOptions(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<PullRequestOptions>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/options`,
    undefined,
    options,
  );
}

export async function comparePullRequestBranches(
  owner: string,
  name: string,
  input: PullRequestCompareInput,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<RepositoryCompare>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/compare`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    options,
  );
}

export async function listRepositoryIssues(
  owner: string,
  name: string,
  params?: {
    labels?: string;
    limit?: number;
    page?: number;
    q?: string;
    status?: "open" | "closed" | "all";
  },
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams();
  if (params?.page) {
    searchParams.set("page", String(params.page));
  }
  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.q) {
    searchParams.set("q", params.q);
  }
  if (params?.labels) {
    searchParams.set("labels", params.labels);
  }
  const query = searchParams.toString();
  return fetchServerApi<PaginatedCollection<Issue>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues${query ? `?${query}` : ""}`,
    undefined,
    options,
  );
}

export async function getRepositoryIssue(
  owner: string,
  name: string,
  number: number,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Issue>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}`,
    undefined,
    options,
  );
}

export async function listIssueLabels(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Collection<IssueLabel>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issue-labels`,
    undefined,
    options,
  );
}

export async function listRepositoryIssueComments(
  owner: string,
  name: string,
  number: number,
  page = 1,
  limit = 100,
) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return fetchServerApi<PaginatedCollection<IssueComment>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}/comments?${searchParams.toString()}`,
  );
}

export async function listRepositoryIssueActivity(
  owner: string,
  name: string,
  number: number,
  page = 1,
  limit = 100,
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return fetchServerApi<PaginatedCollection<ActivityItem>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}/activity?${searchParams.toString()}`,
    undefined,
    options,
  );
}

export async function listPullRequestComments(
  owner: string,
  name: string,
  id: number | string,
  page = 1,
  limit = 100,
) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return fetchServerApi<PaginatedCollection<PullRequestComment>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(id))}/comments?${searchParams.toString()}`,
  );
}

export async function listPullRequestActivity(
  owner: string,
  name: string,
  id: number | string,
  page = 1,
  limit = 100,
  options?: ApiAuthOptions,
) {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return fetchServerApi<PaginatedCollection<ActivityItem>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${encodeURIComponent(String(id))}/activity?${searchParams.toString()}`,
    undefined,
    options,
  );
}

export async function compareUpstream(owner: string, name: string) {
  return fetchServerApi<RepositoryCompare>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare-upstream`,
  );
}

export async function listUserRepositories(
  username: string,
  params?: { q?: string; sort?: string; direction?: string },
  options?: ApiAuthOptions,
) {
  const searchParams = collectionParams(params);
  return fetchServerApi<Collection<Repository>>(
    `/users/${encodeURIComponent(username)}/repos${searchParams}`,
    undefined,
    options,
  );
}

export async function listRepositoryRunnerSecrets(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Collection<RunnerSecret>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/secrets`,
    undefined,
    options,
  );
}

export async function listRepositoryRunnerVariables(
  owner: string,
  name: string,
  options?: ApiAuthOptions,
) {
  return fetchServerApi<Collection<RunnerVariable>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/variables`,
    undefined,
    options,
  );
}

export async function listOrganizationRunnerSecrets(org: string) {
  return fetchServerApi<Collection<RunnerSecret>>(
    `/orgs/${encodeURIComponent(org)}/actions/secrets`,
  );
}

export async function listOrganizationRunnerVariables(org: string) {
  return fetchServerApi<Collection<RunnerVariable>>(
    `/orgs/${encodeURIComponent(org)}/actions/variables`,
  );
}

export function authEndpoint(mode: "login" | "register") {
  return `${publicApiBaseUrl()}/auth/${mode}`;
}

export function repoHref(repo: Pick<Repository, "owner_handle" | "name">) {
  return `/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`;
}

export function repositoryRawFileUrl(
  owner: string,
  name: string,
  path: string,
  refName?: string,
) {
  const searchParams = new URLSearchParams({ path });
  if (refName) {
    searchParams.set("ref", refName);
  }
  return `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/raw?${searchParams.toString()}`;
}

async function fetchServerApi<T>(
  path: string,
  init?: RequestInit,
  options?: ApiAuthOptions,
): Promise<T> {
  const response = await fetch(`${serverApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: requestHeaders(init?.headers, options?.authToken, options?.forwardedHeaders),
  });

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      path,
      parseRetryAfterSeconds(response.headers.get("retry-after")),
    );
  }

  return response.json() as Promise<T>;
}

function requestHeaders(
  headers?: HeadersInit,
  authToken?: string | null,
  forwardedHeaders?: HeadersInit,
) {
  const merged = new Headers(forwardedHeaders);
  if (!merged.has("content-type")) {
    merged.set("content-type", "application/json");
  }
  if (authToken) {
    merged.set("authorization", `Bearer ${authToken}`);
  }
  if (!headers) {
    return merged;
  }

  new Headers(headers).forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.ceil(seconds));
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function normalizeApiUrl(value: string | undefined) {
  return (value?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
}

function collectionParams(params?: { q?: string; sort?: string; direction?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.q) {
    searchParams.set("q", params.q);
  }
  if (params?.sort) {
    searchParams.set("sort", params.sort);
  }
  if (params?.direction) {
    searchParams.set("direction", params.direction);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function runtimeEnv(key: string) {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[key];
}
