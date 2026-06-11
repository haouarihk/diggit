"use client";

import { CodeDiff } from "@/components/CodeDiff";
import { authHeaders } from "@/lib/auth-session";
import type { PullRequest, PullRequestOptions, RepositoryCompare } from "@/lib/api";
import {
  type PullRequestSourceMode,
  type PullRequestSourceSelection,
  decodePullRequestSource,
  normalizeServerUrl,
} from "@/lib/pull-request-flow";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

const API_URL = apiBaseUrl();

type PullRequestSourceStepProps = {
  baseHref: string;
  options: PullRequestOptions;
};

export function PullRequestSourceStep({ baseHref, options }: PullRequestSourceStepProps) {
  const router = useRouter();
  const [sourceMode, setSourceMode] = useState<PullRequestSourceMode>("local");
  const [serverName, setServerName] = useState("");
  const [message, setMessage] = useState("");

  function continueToCompare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({ sourceMode });
    if (sourceMode === "server") {
      const normalizedServer = normalizeServerUrl(serverName);
      if (!normalizedServer) {
        setMessage("Enter the server name first.");
        return;
      }
      params.set("server", normalizedServer);
    }
    router.push(`${baseHref}/pull-requests/new/compare?${params.toString()}`);
  }

  return (
    <form className="grid gap-4 rounded-2xl border border-[#d0d7de] bg-white p-4 shadow-sm sm:p-6" onSubmit={continueToCompare}>
      <StepHeading number={1} title="Where are the changes?" />
      <div className="grid gap-3 lg:grid-cols-3">
        <SourceCard
          checked={sourceMode === "local"}
          description="Pick a branch from this repository or one of its local forks."
          label="This server"
          value="local"
          onChange={setSourceMode}
        />
        <SourceCard
          checked={sourceMode === "server"}
          description="Compare against the same repository name on another Diggit server."
          label="Another server"
          value="server"
          onChange={setSourceMode}
        />
        {options.upstream ? (
          <SourceCard
            checked={sourceMode === "upstream"}
            description={`Use the original repository: ${options.upstream.owner_handle}/${options.upstream.name}.`}
            label="Original server repo"
            value="upstream"
            onChange={setSourceMode}
          />
        ) : null}
      </div>

      {sourceMode === "server" ? (
        <label className="grid gap-1.5">
          Server name
          <input
            className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
            placeholder="https://git.example.com"
            required
            value={serverName}
            onChange={(event) => setServerName(event.target.value)}
          />
        </label>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {message ? <p className="text-sm text-[#59636e]">{message}</p> : <span />}
        <button className="rounded-lg border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white hover:bg-[#116329]" type="submit">
          Continue to compare
        </button>
      </div>
    </form>
  );
}

type PullRequestCompareStepProps = {
  baseHref: string;
  fromOptions: { label: string; options: { label: string; value: string }[] }[];
  initialCompare: RepositoryCompare;
  name: string;
  owner: string;
  selectedFrom: string;
  selectedTarget: string;
  serverName?: string;
  sourceMode: PullRequestSourceMode;
  targetOptions: { label: string; value: string }[];
  upstreamLabel?: string;
};

export function PullRequestCompareStep({
  baseHref,
  fromOptions,
  initialCompare,
  name,
  owner,
  selectedFrom,
  selectedTarget,
  serverName,
  sourceMode,
  targetOptions,
  upstreamLabel,
}: PullRequestCompareStepProps) {
  const requestIdRef = useRef(0);
  const [currentFrom, setCurrentFrom] = useState(selectedFrom);
  const [currentTarget, setCurrentTarget] = useState(selectedTarget);
  const [compare, setCompare] = useState(initialCompare);
  const [isLoading, setIsLoading] = useState(false);
  const sourceLabel = sourceMode === "server" ? "another server" : sourceMode === "upstream" ? upstreamLabel ?? "the original repo" : "this server";
  const createParams = new URLSearchParams({
    from: currentFrom,
    sourceMode,
    targetBranch: currentTarget,
  });

  async function updateComparison(nextFrom: string, nextTarget: string) {
    setCurrentFrom(nextFrom);
    setCurrentTarget(nextTarget);
    const source = decodePullRequestSource(nextFrom);
    if (!source) {
      setCompare(unavailableCompare("Choose a source branch to compare."));
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/compare`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          source_branch: source.branch,
          source_repo_url: source.url,
          source_repository_id: source.repositoryId,
          target_branch: nextTarget,
        }),
      });
      if (requestIdRef.current !== requestId) {
        return;
      }
      if (!response.ok) {
        setCompare(unavailableCompare(`Comparison failed: ${response.status}`));
        return;
      }
      setCompare((await response.json()) as RepositoryCompare);
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setCompare(unavailableCompare(error));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }

  return (
    <>
      <section className="grid gap-4 rounded-2xl border border-[#d0d7de] bg-white p-4 shadow-sm sm:p-6">
        <StepHeading number={2} title="Compare changes between branches" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
          <label className="grid gap-1.5">
            From
            <select
              className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
              name="from"
              required
              value={currentFrom}
              onChange={(event) => void updateComparison(event.target.value, currentTarget)}
            >
              {fromOptions.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="hidden h-10 items-center rounded-full border border-[#d0d7de] bg-white px-3 text-sm font-semibold text-[#59636e] lg:flex">
            into
          </div>
          <label className="grid gap-1.5">
            To
            <select
              className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
              name="targetBranch"
              required
              value={currentTarget}
              onChange={(event) => void updateComparison(currentFrom, event.target.value)}
            >
              {targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-[#59636e]">Showing the diff from {sourceLabel} into the selected target branch.</p>
        {serverName ? <p className="text-xs text-[#59636e]">Server: {serverName}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <a className="rounded-lg border border-[#d0d7de] bg-white px-4 py-2 font-semibold" href={`${baseHref}/pull-requests/new`}>
            Back
          </a>
          <a className="rounded-lg border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white hover:bg-[#116329]" href={`${baseHref}/pull-requests/new/create?${createParams.toString()}`}>
            Continue to create
          </a>
        </div>
      </section>

      {isLoading ? (
        <section className="grid min-h-64 place-items-center rounded-2xl border border-[#d0d7de] bg-white p-8 text-center shadow-sm">
          <div className="grid gap-2">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#d0d7de] border-t-[#0969da]" />
            <h3 className="text-lg font-semibold">Loading comparison...</h3>
            <p className="text-sm text-[#59636e]">Fetching the branch diff.</p>
          </div>
        </section>
      ) : (
        <>
          <CompareSummary compare={compare} />
          <CodeDiff emptyLabel="No file changes between these branches." files={compare.files} />
        </>
      )}
    </>
  );
}

function CompareSummary({ compare }: { compare: RepositoryCompare }) {
  if (compare.status === "unavailable") {
    return (
      <section className="rounded-md border border-[#d0d7de] bg-white p-4 text-[#59636e]">
        {compare.message ?? "Comparison is unavailable."}
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-md border border-[#d0d7de] bg-white p-4 text-sm text-[#59636e]">
      <span>{compare.ahead_by} commits ahead</span>
      <span>{compare.behind_by} commits behind</span>
      <span className="rounded-full border border-[#d0d7de] px-2 py-0.5">{compare.status.replaceAll("_", " ")}</span>
    </section>
  );
}

function unavailableCompare(error: unknown): RepositoryCompare {
  return {
    ahead_by: 0,
    ahead_commits: [],
    behind_by: 0,
    behind_commits: [],
    files: [],
    message: error instanceof Error ? error.message : String(error),
    source: null,
    status: "unavailable",
  };
}

type PullRequestCreateFormProps = {
  baseHref: string;
  defaultTitle: string;
  name: string;
  owner: string;
  selection: PullRequestSourceSelection;
  targetBranch: string;
};

export function PullRequestCreateForm({ baseHref, defaultTitle, name, owner, selection, targetBranch }: PullRequestCreateFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        title: form.get("title"),
        body: form.get("body"),
        source_repo_url: selection.url,
        source_branch: selection.branch,
        source_repository_id: selection.repositoryId,
        target_branch: targetBranch,
      }),
    });

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    const pullRequest = (await response.json()) as PullRequest;
    router.push(`${baseHref}/pull/${encodeURIComponent(String(pullRequest.id))}`);
  }

  return (
    <form className="grid gap-4 rounded-2xl border border-[#d0d7de] bg-white p-4 shadow-sm sm:p-6" onSubmit={submit}>
      <StepHeading number={3} title="Create pull request" />
      <div className="rounded-xl border border-[#d8dee4] bg-[#f6f8fa] p-4 text-sm text-[#59636e]">
        Merging <strong>{selection.branch}</strong> into <strong>{targetBranch}</strong>.
      </div>
      <label className="grid gap-1.5">
        Title
        <input
          className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
          defaultValue={defaultTitle}
          name="title"
          required
        />
      </label>
      <label className="grid gap-1.5">
        Body
        <textarea className="min-h-40 w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="body" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {message ? <p className="text-sm text-[#59636e]">{message}</p> : <span />}
        <button className="rounded-lg border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white hover:bg-[#116329]" type="submit">
          Create pull request
        </button>
      </div>
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
  onChange: (value: PullRequestSourceMode) => void;
  value: PullRequestSourceMode;
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
