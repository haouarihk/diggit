export type Repository = {
  owner_handle: string;
  name: string;
  description: string;
  visibility: string;
  default_branch: string;
  ssh_url: string;
  http_url: string;
  stars_count: number;
  forks_count?: number;
};

export type RepositoryBranch = {
  name: string;
  is_default: boolean;
  commit_sha: string | null;
};

export type SearchUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_fallback: string;
};

export type SearchResponse = {
  query: string;
  federated: {
    description: string;
  };
  data: {
    repositories: Repository[];
    users: SearchUser[];
  };
};

type Collection<T> = {
  data: T[];
};

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_API_URL = "http://localhost:3001";

export function serverApiBaseUrl() {
  return normalizeApiUrl(
    process.env["API_INTERNAL_URL"] ??
      process.env["PUBLIC_API_URL"] ??
      process.env["APP_BASE_URL"],
  );
}

export function publicApiBaseUrl() {
  return normalizeApiUrl(
    import.meta.env.PUBLIC_API_URL ??
      process.env["PUBLIC_API_URL"] ??
      process.env["APP_BASE_URL"],
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

export function authEndpoint(mode: "login" | "register") {
  return `${publicApiBaseUrl()}/auth/${mode}`;
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
