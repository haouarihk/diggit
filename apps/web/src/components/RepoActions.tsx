"use client";

import { apiBaseUrl, publicApiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, getAuthSession, normalizeServerUrl } from "@/lib/auth-session";
import type { PullRequest, PullRequestOptions, PullRequestSourceOption, Repository, RepositoryBranch } from "@/lib/api";

const API_URL = apiBaseUrl();
const PUBLIC_API_URL = publicApiBaseUrl();

export function CreateRepoForm({ initialOwner = "" }: { initialOwner?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/repos`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        name: form.get("name"),
        owner: form.get("owner") || undefined,
        description: form.get("description"),
        visibility: form.get("visibility"),
      }),
    });
    if (response.ok) {
      const repo = (await response.json()) as { owner_handle: string; name: string };
      router.push(`/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`);
      return;
    }
    setMessage(await responseErrorMessage(response));
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Create repository</h2>
      <label className="grid gap-1.5">
        Name
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="name" required />
      </label>
      <label className="grid gap-1.5">
        Owner
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="owner" defaultValue={initialOwner} placeholder="Leave blank for your user, or enter an organization" />
      </label>
      <label className="grid gap-1.5">
        Description
        <textarea className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="description" rows={3} />
      </label>
      <label className="grid gap-1.5">
        Visibility
        <select className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="visibility" defaultValue="public">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Create
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
}

export function ForkRepoForm({ owner, name }: { owner: string; name: string }) {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const session = getAuthSession();
    if (session?.kind === "federated") {
      const response = await fetch(`${session.homeServer}/auth/federated/fork`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.homeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source_repo_url: `${PUBLIC_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
          name: form.get("name") || undefined,
        }),
      });
      setMessage(response.ok ? "Fork created on your home server." : `Failed: ${response.status}`);
      return;
    }

    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/fork`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ name: form.get("name") || undefined }),
      },
    );
    setMessage(response.ok ? "Fork created and federation activity queued." : `Failed: ${response.status}`);
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Fork repository</h2>
      <label className="grid gap-1.5">
        Fork name
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="name" placeholder={name} />
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Fork
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
}

type PullRequestFormProps = {
  name: string;
  options: PullRequestOptions;
  owner: string;
  redirectTo?: string;
  repo: Repository;
};

type SourceMode = "local" | "server" | "upstream";

type SourceSelection = {
  branch: string;
  repositoryId: string | null;
  url: string;
};

export function PullRequestForm({ owner, name, options, redirectTo, repo }: PullRequestFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("local");
  const [serverName, setServerName] = useState("");
  const [remoteBranches, setRemoteBranches] = useState<RepositoryBranch[]>([]);
  const [upstreamBranches, setUpstreamBranches] = useState<RepositoryBranch[]>(options.upstream?.branches ?? []);
  const [loadingRemoteBranches, setLoadingRemoteBranches] = useState(false);
  const [loadingUpstreamBranches, setLoadingUpstreamBranches] = useState(false);
  const [sourceValue, setSourceValue] = useState("");
  const [targetBranch, setTargetBranch] = useState(defaultBranch(options.repository.branches, repo.default_branch));

  function selectSourceMode(nextMode: SourceMode) {
    setSourceMode(nextMode);
    setSourceValue("");
    if (nextMode !== "server") {
      setRemoteBranches([]);
    }
  }

  function updateServerName(value: string) {
    setServerName(value);
    setSourceValue("");
    if (!value.trim()) {
      setRemoteBranches([]);
    }
  }

  useEffect(() => {
    if (sourceMode !== "server") {
      return;
    }

    const trimmedServer = serverName.trim();
    if (!trimmedServer) {
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoadingRemoteBranches(true);
      setRemoteBranches([]);
      const branches = await fetchRepositoryBranches({ baseUrl: normalizeServerUrl(trimmedServer), owner, name });
      if (!cancelled) {
        setRemoteBranches(branches);
        setLoadingRemoteBranches(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [sourceMode, serverName, owner, name]);

  useEffect(() => {
    if (sourceMode !== "upstream" || !options.upstream || options.upstream.branches.length > 0) {
      return;
    }

    const parsed = parseRepositoryUrl(options.upstream.url);
    if (!parsed) {
      return;
    }
    const upstreamRepo = parsed;

    let cancelled = false;
    async function loadUpstreamBranches() {
      setLoadingUpstreamBranches(true);
      const branches = await fetchRepositoryBranches(upstreamRepo);
      if (!cancelled) {
        setUpstreamBranches(branches);
        setLoadingUpstreamBranches(false);
      }
    }

    void loadUpstreamBranches();
    return () => {
      cancelled = true;
    };
  }, [sourceMode, options.upstream]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = selectedSource();
    if (!source) {
      setMessage("Choose a source branch first.");
      return;
    }

    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          title: form.get("title"),
          body: form.get("body"),
          source_repo_url: source.url,
          source_branch: source.branch,
          source_repository_id: source.repositoryId,
          target_branch: targetBranch,
        }),
      },
    );
    if (response.ok) {
      const pullRequest = (await response.json()) as PullRequest;
      setMessage("Pull request opened and activity queued.");
      if (redirectTo) {
        router.push(`${redirectTo}/${encodeURIComponent(String(pullRequest.id))}`);
      }
      return;
    }

    setMessage(await responseErrorMessage(response));
  }

  function selectedSource(): SourceSelection | null {
    if (sourceMode === "local") {
      return decodeSourceSelection(sourceValue);
    }
    if (sourceMode === "server") {
      if (!serverName.trim() || !sourceValue) {
        return null;
      }
      return {
        branch: sourceValue,
        repositoryId: null,
        url: remoteRepositoryGitUrl(serverName, owner, name),
      };
    }
    if (!options.upstream || !sourceValue) {
      return null;
    }
    return {
      branch: sourceValue,
      repositoryId: options.upstream.repository_id,
      url: options.upstream.url,
    };
  }

  const targetBranches = options.repository.branches.length > 0 ? options.repository.branches : fallbackBranches(repo.default_branch);
  const localBranches = options.repository.branches.length > 0 ? options.repository.branches : fallbackBranches(repo.default_branch);
  const upstreamSourceBranches = upstreamBranches.length > 0 ? upstreamBranches : options.upstream?.branches ?? [];
  const selectedSourceLabel = sourceModeLabel(sourceMode, options.upstream);

  return (
    <form className="grid gap-5 rounded-2xl border border-[#d0d7de] bg-white p-4 shadow-sm sm:p-6" onSubmit={submit}>
      <section className="grid gap-3">
        <StepHeading number={1} title="Where are the changes?" />
        <div className="grid gap-3 lg:grid-cols-3">
          <SourceCard
            checked={sourceMode === "local"}
            description="Pick a branch from this repository or one of its local forks."
            label="This server"
            value="local"
            onChange={selectSourceMode}
          />
          <SourceCard
            checked={sourceMode === "server"}
            description="Compare against the same repository name on another Diggit server."
            label="Another server"
            value="server"
            onChange={selectSourceMode}
          />
          {options.upstream ? (
            <SourceCard
              checked={sourceMode === "upstream"}
              description={`Use the original repository: ${options.upstream.owner_handle}/${options.upstream.name}.`}
              label="Original server repo"
              value="upstream"
              onChange={selectSourceMode}
            />
          ) : null}
        </div>
        {sourceMode === "server" ? (
          <label className="grid gap-1.5">
            Server name
            <input
              className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
              placeholder="https://git.example.com"
              value={serverName}
              onChange={(event) => updateServerName(event.target.value)}
            />
          </label>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-xl border border-[#d8dee4] bg-[#f6f8fa] p-4">
        <StepHeading number={2} title="Compare changes between branches" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
          <label className="grid gap-1.5">
            From
            {sourceMode === "local" ? (
              <select
                className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
                required
                value={sourceValue}
                onChange={(event) => setSourceValue(event.target.value)}
              >
                <option value="" disabled>
                  Select a source branch
                </option>
                <optgroup label="Branches in this repository">
                  {localBranches.map((branch) => (
                    <option key={branch.name} value={encodeSourceSelection(options.repository, branch.name)}>
                      {branchLabel(branch)}
                    </option>
                  ))}
                </optgroup>
                {options.forks.length > 0 ? (
                  <optgroup label="Branches from forks">
                    {options.forks.flatMap((fork) =>
                      fork.branches.map((branch) => (
                        <option key={`${fork.repository_id}:${branch.name}`} value={encodeSourceSelection(fork, branch.name)}>
                          {fork.owner_handle}/{fork.name}:{branchLabel(branch)}
                        </option>
                      )),
                    )}
                  </optgroup>
                ) : null}
              </select>
            ) : null}
            {sourceMode === "server" ? (
              <select
                className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328] disabled:bg-white/60 disabled:text-[#59636e]"
                disabled={loadingRemoteBranches || remoteBranches.length === 0}
                required
                value={sourceValue}
                onChange={(event) => setSourceValue(event.target.value)}
              >
                <option value="" disabled>
                  {loadingRemoteBranches ? "Loading branches..." : "Select a branch from that server"}
                </option>
                {remoteBranches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branchLabel(branch)}
                  </option>
                ))}
              </select>
            ) : null}
            {sourceMode === "upstream" ? (
              <select
                className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328] disabled:bg-white/60 disabled:text-[#59636e]"
                disabled={loadingUpstreamBranches || upstreamSourceBranches.length === 0}
                required
                value={sourceValue}
                onChange={(event) => setSourceValue(event.target.value)}
              >
                <option value="" disabled>
                  {loadingUpstreamBranches ? "Loading upstream branches..." : "Select an upstream branch"}
                </option>
                {upstreamSourceBranches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branchLabel(branch)}
                  </option>
                ))}
              </select>
            ) : null}
          </label>

          <div className="hidden h-10 items-center rounded-full border border-[#d0d7de] bg-white px-3 text-sm font-semibold text-[#59636e] lg:flex">
            into
          </div>

          <label className="grid gap-1.5">
            To
            <select
              className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
              required
              value={targetBranch}
              onChange={(event) => setTargetBranch(event.target.value)}
            >
              {targetBranches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branchLabel(branch)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-[#59636e]">
          Comparing {selectedSourceLabel} into {owner}/{name}. The pull request will target <strong>{targetBranch}</strong>.
        </p>
        {sourceMode === "server" && serverName && !loadingRemoteBranches && remoteBranches.length === 0 ? (
          <p className="rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-sm text-[#59636e]">
            Could not load branches from that server. Check the server name and that {owner}/{name} exists there.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3">
        <StepHeading number={3} title="Create pull request" />
        <label className="grid gap-1.5">
          Title
          <input className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="title" required />
        </label>
        <label className="grid gap-1.5">
          Body
          <textarea className="min-h-32 w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="body" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {message ? <p className="text-sm text-[#59636e]">{message}</p> : <span />}
          <button className="cursor-pointer rounded-lg border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white hover:bg-[#116329]" type="submit">
            Create pull request
          </button>
        </div>
      </section>
    </form>
  );
}

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0969da] text-sm font-bold text-white">{number}</span>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  );
}

function SourceCard({
  checked,
  description,
  label,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: SourceMode) => void;
  value: SourceMode;
}) {
  return (
    <label
      className={`grid cursor-pointer gap-2 rounded-xl border p-4 transition ${
        checked ? "border-[#0969da] bg-[#ddf4ff]" : "border-[#d0d7de] bg-[#f6f8fa] hover:bg-white"
      }`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <input checked={checked} name="sourceMode" type="radio" value={value} onChange={() => onChange(value)} />
        {label}
      </span>
      <span className="text-sm text-[#59636e]">{description}</span>
    </label>
  );
}

function encodeSourceSelection(option: PullRequestSourceOption, branch: string) {
  return JSON.stringify({
    branch,
    repositoryId: option.repository_id,
    url: option.url,
  } satisfies SourceSelection);
}

function decodeSourceSelection(value: string): SourceSelection | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as SourceSelection;
    if (!parsed.branch || !parsed.url) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sourceModeLabel(sourceMode: SourceMode, upstream: PullRequestSourceOption | null) {
  if (sourceMode === "server") {
    return "another server";
  }
  if (sourceMode === "upstream" && upstream) {
    return `${upstream.owner_handle}/${upstream.name}`;
  }
  return "this server";
}

function branchLabel(branch: RepositoryBranch) {
  return `${branch.name}${branch.is_default ? " (default)" : ""}`;
}

function defaultBranch(branches: RepositoryBranch[], preferred: string) {
  return branches.find((branch) => branch.name === preferred)?.name ?? branches.find((branch) => branch.is_default)?.name ?? branches[0]?.name ?? preferred ?? "main";
}

function fallbackBranches(name: string): RepositoryBranch[] {
  return [{ name: name || "main", is_default: true, commit_sha: null }];
}

function remoteRepositoryGitUrl(serverName: string, owner: string, name: string) {
  return `${normalizeServerUrl(serverName)}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.git`;
}

async function responseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Fall through to the status fallback when the API did not return JSON.
  }

  return `Failed: ${response.status}`;
}

async function fetchRepositoryBranches(repo: { baseUrl?: string; owner: string; name: string }) {
  const baseUrl = repo.baseUrl ?? API_URL;
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches`,
      {
        headers: authHeaders(),
      },
    );
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { data?: RepositoryBranch[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

function parseRepositoryUrl(value: string) {
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
