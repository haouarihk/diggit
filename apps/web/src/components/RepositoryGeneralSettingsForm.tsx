"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import type { Repository, RepositoryBranch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_URL = apiBaseUrl();

type RepositoryGeneralSettingsFormProps = {
  branches: RepositoryBranch[];
  redirectTo: string;
  repository: Repository;
};

type DangerAction = "visibility" | "transfer" | "archive" | "delete" | null;

export function RepositoryGeneralSettingsForm({ branches, redirectTo, repository }: RepositoryGeneralSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(repository.name);
  const [defaultBranch, setDefaultBranch] = useState(repository.default_branch);
  const [issuesEnabled, setIssuesEnabled] = useState(repository.issues_enabled);
  const [pullRequestsEnabled, setPullRequestsEnabled] = useState(repository.pull_requests_enabled);
  const [pullRequestPolicy, setPullRequestPolicy] = useState(repository.pull_request_policy || "anyone");
  const [visibility, setVisibility] = useState(repository.visibility);
  const [transferOwner, setTransferOwner] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [activeAction, setActiveAction] = useState<DangerAction>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const repoLabel = `${repository.owner_handle}/${repository.name}`;
  const repoPath = `/repos/${encodeURIComponent(repository.owner_handle)}/${encodeURIComponent(repository.name)}`;

  async function saveGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    const response = await fetch(`${API_URL}${repoPath}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        name,
        default_branch: defaultBranch,
        issues_enabled: issuesEnabled,
        pull_requests_enabled: pullRequestsEnabled,
        pull_request_policy: pullRequestPolicy,
      }),
    });

    setIsSaving(false);
    if (!response.ok) {
      await showError(response, "Unable to save repository settings.");
      return;
    }

    const updated = (await response.json()) as Repository;
    setMessage("Repository settings saved.");
    router.push(`/${encodeURIComponent(updated.owner_handle)}/${encodeURIComponent(updated.name)}/settings`);
    router.refresh();
  }

  async function changeVisibility() {
    await runDangerRequest(`${API_URL}${repoPath}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    });
  }

  async function transferRepository() {
    await runDangerRequest(`${API_URL}${repoPath}/transfer`, {
      method: "POST",
      body: JSON.stringify({ owner: transferOwner }),
    });
  }

  async function archiveRepository() {
    await runDangerRequest(`${API_URL}${repoPath}/archive`, {
      method: "POST",
      body: JSON.stringify({ archived: !repository.archived_at }),
    });
  }

  async function deleteRepository() {
    if (confirmation !== repoLabel) {
      setMessage(`Type ${repoLabel} to confirm deletion.`);
      return;
    }
    await runDangerRequest(`${API_URL}${repoPath}`, { method: "DELETE" }, redirectTo);
  }

  async function runDangerRequest(url: string, init: RequestInit, redirect?: string) {
    setIsSaving(true);
    setMessage("");
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
        ...init.headers,
      },
    });
    setIsSaving(false);
    if (!response.ok) {
      await showError(response, "Action failed.");
      return;
    }
    setActiveAction(null);
    setConfirmation("");
    if (redirect) {
      router.push(redirect);
    } else {
      const updated = response.status === 204 ? null : ((await response.json().catch(() => null)) as Repository | null);
      if (updated?.owner_handle && updated?.name) {
        router.push(`/${encodeURIComponent(updated.owner_handle)}/${encodeURIComponent(updated.name)}/settings`);
      }
      router.refresh();
    }
  }

  async function showError(response: Response, fallback: string) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setMessage(body?.error ?? `${fallback} (${response.status})`);
  }

  return (
    <main className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">General settings</h2>
        <p className="text-[#59636e]">Control repository identity, defaults, and contribution rules.</p>
      </section>

      <form className="grid gap-6" onSubmit={saveGeneral}>
        <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold">Repository name</h3>
            <p className="text-sm text-[#59636e]">Rename this repository within the current owner namespace.</p>
          </div>
          <label className="grid gap-2">
            <span className="font-semibold">Name</span>
            <input
              className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </section>

        <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold">Default branch</h3>
            <p className="text-sm text-[#59636e]">Choose the branch shown first for code and pull requests.</p>
          </div>
          <select
            className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2"
            value={defaultBranch}
            onChange={(event) => setDefaultBranch(event.target.value)}
          >
            {branches.length === 0 ? <option value={defaultBranch}>{defaultBranch} (default)</option> : null}
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
                {branch.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </section>

        <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold">Features</h3>
            <p className="text-sm text-[#59636e]">Enable or disable repository features.</p>
          </div>
          <label className="flex items-start gap-3">
            <input checked={issuesEnabled} className="mt-1" type="checkbox" onChange={(event) => setIssuesEnabled(event.target.checked)} />
            <span>
              <span className="block font-semibold">Issues</span>
              <span className="text-sm text-[#59636e]">Allow issue tracking in this repository.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              checked={pullRequestsEnabled}
              className="mt-1"
              type="checkbox"
              onChange={(event) => setPullRequestsEnabled(event.target.checked)}
            />
            <span>
              <span className="block font-semibold">Pull requests</span>
              <span className="text-sm text-[#59636e]">Allow pull requests against this repository.</span>
            </span>
          </label>
        </section>

        <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold">Pull request permissions</h3>
            <p className="text-sm text-[#59636e]">Choose who can open pull requests.</p>
          </div>
          <label className="flex items-start gap-3">
            <input
              checked={pullRequestPolicy === "anyone"}
              name="pull-request-policy"
              type="radio"
              value="anyone"
              onChange={(event) => setPullRequestPolicy(event.target.value)}
            />
            <span>
              <span className="block font-semibold">Allow pull requests from anyone</span>
              <span className="text-sm text-[#59636e]">Any signed-in user or accepted remote contributor can propose changes.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              checked={pullRequestPolicy === "collaborators"}
              name="pull-request-policy"
              type="radio"
              value="collaborators"
              onChange={(event) => setPullRequestPolicy(event.target.value)}
            />
            <span>
              <span className="block font-semibold">Allow pull requests only from collaborators</span>
              <span className="text-sm text-[#59636e]">Restrict new pull requests to users with repository access.</span>
            </span>
          </label>
        </section>

        <div className="flex items-center gap-3">
          <button className="rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white disabled:opacity-60" disabled={isSaving} type="submit">
            {isSaving ? "Saving..." : "Save changes"}
          </button>
          {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
        </div>
      </form>

      <section className="rounded-md border border-[#cf222e] bg-white">
        <div className="border-b border-[#d8dee4] p-5">
          <h3 className="text-xl font-semibold text-[#cf222e]">Danger Zone</h3>
        </div>
        <DangerRow
          action="Change repository visibility"
          description="Switch this repository between public and private visibility."
          onClick={() => {
            setVisibility(repository.visibility === "private" ? "public" : "private");
            setActiveAction("visibility");
          }}
        />
        <DangerRow
          action="Transfer ownership"
          description="Move this repository to another user or organization namespace."
          onClick={() => setActiveAction("transfer")}
        />
        <DangerRow
          action={repository.archived_at ? "Unarchive this repository" : "Archive this repository"}
          description="Archived repositories are kept for reference and can be unarchived later."
          onClick={() => setActiveAction("archive")}
        />
        <DangerRow action="Delete this repository" description="Permanently delete the repository and Git storage." onClick={() => setActiveAction("delete")} />
      </section>

      <Drawer isOpen={activeAction === "visibility"} title="Change repository visibility" onClose={() => setActiveAction(null)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">Change {repoLabel} to {visibility} visibility.</p>
          <select className="max-w-sm rounded-md border border-[#d0d7de] bg-white px-3 py-2" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <ConfirmButton disabled={isSaving} label="Change visibility" onClick={changeVisibility} />
        </div>
      </Drawer>

      <Drawer isOpen={activeAction === "transfer"} title="Transfer ownership" onClose={() => setActiveAction(null)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">Enter the destination user or organization handle.</p>
          <input className="max-w-sm rounded-md border border-[#d0d7de] bg-white px-3 py-2" value={transferOwner} onChange={(event) => setTransferOwner(event.target.value)} />
          <ConfirmButton disabled={isSaving || !transferOwner.trim()} label="Transfer repository" onClick={transferRepository} />
        </div>
      </Drawer>

      <Drawer isOpen={activeAction === "archive"} title={repository.archived_at ? "Unarchive repository" : "Archive repository"} onClose={() => setActiveAction(null)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">{repository.archived_at ? "Restore this repository to active use." : "Mark this repository as archived."}</p>
          <ConfirmButton disabled={isSaving} label={repository.archived_at ? "Unarchive repository" : "Archive repository"} onClick={archiveRepository} />
        </div>
      </Drawer>

      <Drawer isOpen={activeAction === "delete"} title="Delete repository" onClose={() => setActiveAction(null)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">This permanently deletes {repoLabel}. Type the full repository name to confirm.</p>
          <input
            className="max-w-sm rounded-md border border-[#d0d7de] bg-white px-3 py-2"
            placeholder={repoLabel}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <ConfirmButton disabled={isSaving} label="Delete repository" onClick={deleteRepository} />
        </div>
      </Drawer>
    </main>
  );
}

function DangerRow({ action, description, onClick }: { action: string; description: string; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d8dee4] p-5 last:border-b-0">
      <div>
        <h4 className="font-semibold">{action}</h4>
        <p className="text-sm text-[#59636e]">{description}</p>
      </div>
      <button className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8]" type="button" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function ConfirmButton({ disabled, label, onClick }: { disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className="w-fit rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8] disabled:opacity-60"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {disabled ? "Working..." : label}
    </button>
  );
}
