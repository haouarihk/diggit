"use client";

import { apiBaseUrl, publicApiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, getAuthSession } from "@/lib/auth-session";
import type { RepositoryBranch } from "@/lib/api";

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
    setMessage(`Failed: ${response.status}`);
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

export function PullRequestForm({ owner, name, redirectTo }: { owner: string; name: string; redirectTo?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sourceRepoUrl, setSourceRepoUrl] = useState("");
  const [sourceBranches, setSourceBranches] = useState<RepositoryBranch[]>([]);
  const [targetBranches, setTargetBranches] = useState<RepositoryBranch[]>([]);
  const [loadingSourceBranches, setLoadingSourceBranches] = useState(false);
  const [loadingTargetBranches, setLoadingTargetBranches] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadTargetBranches() {
      setLoadingTargetBranches(true);
      const branches = await fetchRepositoryBranches({ owner, name });
      if (!cancelled) {
        setTargetBranches(branches);
        setLoadingTargetBranches(false);
      }
    }

    void loadTargetBranches();
    return () => {
      cancelled = true;
    };
  }, [owner, name]);

  useEffect(() => {
    const trimmedUrl = sourceRepoUrl.trim();
    if (!trimmedUrl) {
      setSourceBranches([]);
      setLoadingSourceBranches(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const parsed = parseRepositoryUrl(trimmedUrl);
      if (!parsed) {
        setSourceBranches([]);
        setLoadingSourceBranches(false);
        return;
      }

      setLoadingSourceBranches(true);
      setSourceBranches([]);
      const branches = await fetchRepositoryBranches(parsed);
      if (!cancelled) {
        setSourceBranches(branches);
        setLoadingSourceBranches(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [sourceRepoUrl]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
          source_repo_url: form.get("sourceRepoUrl"),
          source_branch: form.get("sourceBranch"),
          target_branch: form.get("targetBranch"),
        }),
      },
    );
    if (response.ok) {
      setMessage("Pull request opened and activity queued.");
      if (redirectTo) {
        router.push(redirectTo);
      }
      return;
    }

    setMessage(`Failed: ${response.status}`);
  }

  const targetFallbackBranch = targetBranches.find((branch) => branch.is_default)?.name ?? targetBranches[0]?.name ?? "main";

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Open federated pull request</h2>
      <label className="grid gap-1.5">
        Title
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="title" required />
      </label>
      <label className="grid gap-1.5">
        Source repo URL
        <input
          className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
          name="sourceRepoUrl"
          required
          value={sourceRepoUrl}
          onChange={(event) => setSourceRepoUrl(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <label className="grid gap-1.5">
          Source branch
          <select
            className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328] disabled:bg-[#f6f8fa] disabled:text-[#59636e]"
            name="sourceBranch"
            required
            disabled={loadingSourceBranches || sourceBranches.length === 0}
            defaultValue=""
          >
            <option value="" disabled>
              {loadingSourceBranches ? "Loading branches..." : "Enter a source repo URL first"}
            </option>
            {sourceBranches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
                {branch.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          Target branch
          <select
            className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328] disabled:bg-[#f6f8fa] disabled:text-[#59636e]"
            name="targetBranch"
            disabled={loadingTargetBranches}
            defaultValue={targetFallbackBranch}
            key={targetFallbackBranch}
          >
            {loadingTargetBranches ? <option value={targetFallbackBranch}>Loading branches...</option> : null}
            {targetBranches.length === 0 && !loadingTargetBranches ? (
              <option value="main">main</option>
            ) : null}
            {targetBranches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
                {branch.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {sourceRepoUrl && !loadingSourceBranches && sourceBranches.length === 0 ? (
        <p className="text-sm text-[#59636e]">
          Could not load branches for that source repository URL. Use a Diggit repository URL that this server can read.
        </p>
      ) : null}
      <label className="grid gap-1.5">
        Body
        <textarea className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="body" rows={4} />
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Open PR
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
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
