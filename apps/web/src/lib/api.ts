import { apiBaseUrl, publicApiBaseUrl } from "@/lib/runtime-config";
const API_URL = apiBaseUrl();

export type Repository = {
  id: string;
  namespace_id: string | null;
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
  issues_enabled: boolean;
  pull_requests_enabled: boolean;
  pull_request_policy: "anyone" | "collaborators" | string;
  archived_at: string | null;
  dominant_language: string;
  stars_count: number;
  viewer_has_starred: boolean;
  forks_count?: number;
  remote_url: string | null;
  remote_server: string | null;
  source_repository_id: string | null;
  source_remote_url: string | null;
  source_url: string | null;
  source_repository: RepositorySource | null;
  ssh_url: string;
  http_url: string;
  created_at: string;
  updated_at: string;
};

export type RepositorySource = {
  owner_handle: string;
  name: string;
  url: string;
  kind: "local" | "remote" | string;
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

export type SearchUser = Omit<CurrentUser, "id"> & {
  id: string;
  created_at: string;
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
    mode: string;
    description: string;
  };
  unsupportedTypes: string[];
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

export type PullRequest = {
  id: string;
  target_repository_id: string;
  source_repository_id: string | null;
  title: string;
  body: string;
  author_handle: string;
  source_repo_url: string;
  source_branch: string;
  target_branch: string;
  status: "open" | "closed" | "merged" | string;
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

export type IssueLabel = {
  id: string;
  name: string;
  color: string;
};

export type IssueComment = {
  id: string;
  repository_id: string | null;
  pull_request_id: string | null;
  issue_id: string | null;
  author_handle: string;
  author_actor_url: string | null;
  author_display_name: string;
  author_avatar_url: string | null;
  remote_server: string | null;
  body: string;
  activity_id: string | null;
  created_at: string;
};

export type RepositoryCommit = {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  author_username: string | null;
  author_avatar_url: string | null;
  avatar_fallback: string;
  created_at: string;
};

export type RepositoryBranch = {
  name: string;
  is_default: boolean;
  commit_sha: string | null;
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

export type RepositoryStats = {
  commits_count: number;
  branches_count: number;
  tags_count: number;
  releases_count: number;
};

export type RepositoryTag = {
  name: string;
  commit_sha: string | null;
};

export type RepositoryDiffLine = {
  kind: "addition" | "deletion" | "context";
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
  status: "up_to_date" | "ahead" | "behind" | "diverged" | "unavailable" | string;
  source: RepositorySource | null;
  ahead_by: number;
  behind_by: number;
  ahead_commits: RepositoryCommit[];
  behind_commits: RepositoryCommit[];
  files: RepositoryDiffFile[];
  message: string | null;
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

export type PaginatedCollection<T> = Collection<T> & {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await serverAuthHeaders(init?.headers);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function serverAuthHeaders(headers?: HeadersInit): Promise<Record<string, string>> {
  if (typeof window !== "undefined" || hasAuthorizationHeader(headers)) {
    return {};
  }

  try {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get("diggit_token")?.value;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function hasAuthorizationHeader(headers?: HeadersInit) {
  if (!headers) {
    return false;
  }
  if (headers instanceof Headers) {
    return headers.has("authorization");
  }
  if (Array.isArray(headers)) {
    return headers.some(([key]) => key.toLowerCase() === "authorization");
  }
  return Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
}

export function listRepositories() {
  return apiFetch<Collection<Repository>>("/repos");
}

export function listUserRepositories(username: string, params?: { q?: string; sort?: string; direction?: string }) {
  const searchParams = collectionParams(params);
  return apiFetch<Collection<Repository>>(`/users/${encodeURIComponent(username)}/repos${searchParams}`);
}

export function listOrganizationRepositories(org: string, params?: { q?: string; sort?: string; direction?: string }) {
  const searchParams = collectionParams(params);
  return apiFetch<Collection<Repository>>(`/organizations/${encodeURIComponent(org)}/repos${searchParams}`);
}

export function getUser(username: string) {
  return apiFetch<CurrentUser>(`/users/${encodeURIComponent(username)}`);
}

export function getOrganization(org: string) {
  return apiFetch<Organization>(`/organizations/${encodeURIComponent(org)}`);
}

export function listOrganizationMembers(org: string) {
  return apiFetch<Collection<Collaborator>>(`/organizations/${encodeURIComponent(org)}/members`);
}

export function getRepository(owner: string, name: string) {
  return apiFetch<Repository>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
}

export function getRepositoryTree(owner: string, name: string, refName?: string, path?: string, recursive = false) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  if (path) {
    searchParams.set("path", path);
  }
  if (recursive) {
    searchParams.set("recursive", "true");
  }
  const query = searchParams.toString();
  return apiFetch<RepositoryTree>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree${query ? `?${query}` : ""}`,
  );
}

export function listRepositoryBranches(owner: string, name: string) {
  return apiFetch<Collection<RepositoryBranch>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`,
  );
}

export function listRepositoryTags(owner: string, name: string) {
  return apiFetch<Collection<RepositoryTag>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tags`);
}

export function getRepositoryStats(owner: string, name: string, refName?: string) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return apiFetch<RepositoryStats>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/stats${query ? `?${query}` : ""}`,
  );
}

export function listRepositoryLanguages(owner: string, name: string, refName?: string) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return apiFetch<Collection<RepositoryLanguage>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages${query ? `?${query}` : ""}`,
  );
}

export function listRepositoryContributors(owner: string, name: string, refName?: string) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return apiFetch<Collection<RepositoryContributor>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contributors${query ? `?${query}` : ""}`,
  );
}

export function listRepositoryCollaborators(owner: string, name: string) {
  return apiFetch<Collection<Collaborator>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/collaborators`,
  );
}

export function getRepositoryFile(owner: string, name: string, path: string, refName?: string) {
  const searchParams = new URLSearchParams({ path });
  if (refName) {
    searchParams.set("ref", refName);
  }
  return apiFetch<RepositoryFile>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${searchParams.toString()}`,
  );
}

export function listCommits(owner: string, name: string, refName?: string, limit?: number) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  if (limit !== undefined) {
    searchParams.set("limit", String(limit));
  }
  const query = searchParams.toString();
  return apiFetch<Collection<RepositoryCommit>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits${query ? `?${query}` : ""}`,
  );
}

export function getCommit(owner: string, name: string, sha: string) {
  return apiFetch<RepositoryCommitDetail>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(sha)}`,
  );
}

export function listRepositoryIssues(
  owner: string,
  name: string,
  params?: { labels?: string; limit?: number; page?: number; q?: string; status?: "open" | "closed" | "all" },
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
  return apiFetch<PaginatedCollection<Issue>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues${query ? `?${query}` : ""}`,
  );
}

export function getRepositoryIssue(owner: string, name: string, number: number) {
  return apiFetch<Issue>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}`);
}

export function listIssueLabels(owner: string, name: string) {
  return apiFetch<Collection<IssueLabel>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issue-labels`);
}

export function listPullRequests(owner: string, name: string) {
  return apiFetch<Collection<PullRequest>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests`,
  );
}

export function getPullRequest(owner: string, name: string, id: string) {
  return apiFetch<PullRequest>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(id)}`,
  );
}

export function getPullRequestOptions(owner: string, name: string) {
  return apiFetch<PullRequestOptions>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/options`,
  );
}

export function comparePullRequestBranches(owner: string, name: string, input: PullRequestCompareInput) {
  return apiFetch<RepositoryCompare>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/compare`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function listRepositoryRunnerSecrets(owner: string, name: string) {
  return apiFetch<Collection<RunnerSecret>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/secrets`,
  );
}

export function listRepositoryRunnerVariables(owner: string, name: string) {
  return apiFetch<Collection<RunnerVariable>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/variables`,
  );
}

export function listOrganizationRunnerSecrets(org: string) {
  return apiFetch<Collection<RunnerSecret>>(`/orgs/${encodeURIComponent(org)}/actions/secrets`);
}

export function listOrganizationRunnerVariables(org: string) {
  return apiFetch<Collection<RunnerVariable>>(`/orgs/${encodeURIComponent(org)}/actions/variables`);
}

export function listRepositoryIssueComments(owner: string, name: string, number: number, page = 1, limit = 100) {
  const searchParams = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiFetch<PaginatedCollection<IssueComment>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}/comments?${searchParams.toString()}`,
  );
}

export function compareUpstream(owner: string, name: string) {
  return apiFetch<RepositoryCompare>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare-upstream`,
  );
}

export function repositoryRawFileUrl(owner: string, name: string, path: string, refName?: string) {
  const searchParams = new URLSearchParams({ path });
  if (refName) {
    searchParams.set("ref", refName);
  }
  return `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/raw?${searchParams.toString()}`;
}

export function listServers() {
  return apiFetch<Collection<ServerPolicy>>("/servers");
}

export function listActivities() {
  return apiFetch<Collection<Activity>>("/activities");
}

export function listOrganizations(token?: string) {
  return apiFetch<Collection<Organization>>("/organizations", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

export function search(query: string, type: string) {
  return apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
}

export function repoHref(repo: Pick<Repository, "owner_handle" | "name">) {
  return `/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`;
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
