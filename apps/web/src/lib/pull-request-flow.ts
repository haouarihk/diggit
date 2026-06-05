import type { PullRequestSourceOption, RepositoryBranch } from "@/lib/api";

export type PullRequestSourceMode = "local" | "server" | "upstream";

export type PullRequestSourceSelection = {
  branch: string;
  repositoryId: string | null;
  url: string;
};

export function encodePullRequestSource(selection: PullRequestSourceSelection) {
  return JSON.stringify(selection);
}

export function decodePullRequestSource(value?: string | null): PullRequestSourceSelection | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as PullRequestSourceSelection;
    if (!parsed.branch || !parsed.url) {
      return null;
    }
    return {
      branch: parsed.branch,
      repositoryId: parsed.repositoryId ?? null,
      url: parsed.url,
    };
  } catch {
    return null;
  }
}

export function sourceFromOption(option: PullRequestSourceOption, branch: string): PullRequestSourceSelection {
  return {
    branch,
    repositoryId: option.repository_id,
    url: option.url,
  };
}

export function branchLabel(branch: RepositoryBranch) {
  return `${branch.name}${branch.is_default ? " (default)" : ""}`;
}

export function fallbackBranches(name: string): RepositoryBranch[] {
  return [{ name: name || "main", is_default: true, commit_sha: null }];
}

export function defaultBranch(branches: RepositoryBranch[], preferred: string) {
  return branches.find((branch) => branch.name === preferred)?.name ?? branches.find((branch) => branch.is_default)?.name ?? branches[0]?.name ?? preferred ?? "main";
}

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function remoteRepositoryGitUrl(serverName: string, owner: string, name: string) {
  return `${normalizeServerUrl(serverName)}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.git`;
}

export function parseRepositoryUrl(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const repoIndex = parts[0] === "repos" ? 1 : 0;
    const owner = parts[repoIndex];
    const rawName = parts[repoIndex + 1];
    if (!owner || !rawName) {
      return null;
    }

    return {
      baseUrl: url.origin,
      owner: decodeURIComponent(owner),
      name: decodeURIComponent(rawName.replace(/\.git$/, "")),
    };
  } catch {
    const parts = value.split("/").filter(Boolean);
    const owner = parts[0];
    const rawName = parts[1];
    if (!owner || !rawName) {
      return null;
    }

    return {
      owner,
      name: rawName.replace(/\.git$/, ""),
    };
  }
}
