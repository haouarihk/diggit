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
};

export type RepositoryTag = {
  name: string;
  commit_sha: string | null;
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

type Collection<T> = {
  data: T[];
};

type PaginatedCollection<T> = Collection<T> & {
  pagination?: {
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

export function serverApiBaseUrl() {
  return normalizeApiUrl(
    runtimeEnv("API_INTERNAL_URL") ??
      runtimeEnv("PUBLIC_API_URL") ??
      runtimeEnv("APP_BASE_URL"),
  );
}

export function publicApiBaseUrl() {
  return normalizeApiUrl(
    import.meta.env.PUBLIC_API_URL ??
      runtimeEnv("PUBLIC_API_URL") ??
      runtimeEnv("APP_BASE_URL"),
  );
}

export async function listRepositories() {
  return fetchServerApi<Collection<Repository>>("/repos");
}

export async function searchRepositories(query: string, type: string) {
  return fetchServerApi<SearchResponse>(
    `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`,
  );
}

export async function getRepository(owner: string, name: string) {
  return fetchServerApi<Repository>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  );
}

export async function listRepositoryBranches(owner: string, name: string) {
  return fetchServerApi<Collection<RepositoryBranch>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`,
  );
}

export async function listRepositoryTags(owner: string, name: string) {
  return fetchServerApi<Collection<RepositoryTag>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tags`,
  );
}

export async function getRepositoryStats(
  owner: string,
  name: string,
  refName?: string,
) {
    const searchParams = new URLSearchParams();
    if (refName) {
      searchParams.set("ref", refName);
    }
    const query = searchParams.toString();
    return fetchServerApi<RepositoryStats>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/stats${query ? `?${query}` : ""}`,
    );
}

export async function listRepositoryLanguages(
  owner: string,
  name: string,
  refName?: string,
) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return fetchServerApi<Collection<RepositoryLanguage>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages${query ? `?${query}` : ""}`,
  );
}

export async function listRepositoryContributors(
  owner: string,
  name: string,
  refName?: string,
) {
  const searchParams = new URLSearchParams();
  if (refName) {
    searchParams.set("ref", refName);
  }
  const query = searchParams.toString();
  return fetchServerApi<Collection<RepositoryContributor>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contributors${query ? `?${query}` : ""}`,
  );
}

export async function getRepositoryTree(
  owner: string,
  name: string,
  refName?: string,
  path?: string,
  options: { includeLastCommit?: boolean; recursive?: boolean } = {},
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
  );
}

export async function getRepositoryFile(
  owner: string,
  name: string,
  path: string,
  refName?: string,
) {
  const searchParams = new URLSearchParams({ path });
  if (refName) {
    searchParams.set("ref", refName);
  }
  return fetchServerApi<RepositoryFile>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${searchParams.toString()}`,
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
  return fetchServerApi<PaginatedCollection<unknown>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests?${query}`,
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

async function fetchServerApi<T>(path: string): Promise<T> {
  const response = await fetch(`${serverApiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function normalizeApiUrl(value: string | undefined) {
  return (value?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
}

function runtimeEnv(key: string) {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[key];
}
