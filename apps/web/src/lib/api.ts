const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  dominant_language: string;
  stars_count: number;
  forks_count?: number;
  remote_url: string | null;
  remote_server: string | null;
  source_repository_id: string | null;
  ssh_url: string;
  http_url: string;
  created_at: string;
  updated_at: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_fallback: string;
  is_admin: boolean;
};

export type SearchUser = CurrentUser & {
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

export type PullRequest = {
  id: string;
  title: string;
  body: string;
  author_handle: string;
  source_repo_url: string;
  source_branch: string;
  target_branch: string;
  status: string;
  created_at: string;
};

export type RepositoryCommit = {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  avatar_fallback: string;
  created_at: string;
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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
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

export function getRepositoryTree(owner: string, name: string, refName?: string) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return apiFetch<RepositoryTree>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree${query ? `?${query}` : ""}`,
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

export function repositoryRawFileUrl(owner: string, name: string, path: string, refName?: string) {
  const searchParams = new URLSearchParams({ path });
  if (refName) {
    searchParams.set("ref", refName);
  }
  return `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/raw?${searchParams.toString()}`;
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
