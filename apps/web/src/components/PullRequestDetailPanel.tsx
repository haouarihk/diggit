"use client";

import { ConversationPanel } from "@/components/ConversationPanel";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { RepositoryLabelBadges } from "@/components/RepositoryLabelBadges";
import { authHeaders } from "@/lib/auth-session";
import type { ActivityItem, PullRequest } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = apiBaseUrl();

type PullRequestDetailPanelProps = {
  activity: ActivityItem[];
  baseHref: string;
  name: string;
  owner: string;
  pullRequest: PullRequest;
};

export function PullRequestDetailPanel({
  activity: initialActivity,
  baseHref,
  name,
  owner,
  pullRequest: initialPullRequest,
}: PullRequestDetailPanelProps) {
  const router = useRouter();
  const [pullRequest, setPullRequest] = useState(initialPullRequest);
  const [labelInput, setLabelInput] = useState(joinLabels(initialPullRequest.labels));
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const commentsUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.id))}/comments`;
  const activityUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${encodeURIComponent(String(pullRequest.id))}/activity`;
  const attachmentUploadUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/comment-attachments`;

  async function updateStatus(status: "open" | "closed") {
    setIsBusy(true);
    setMessage("");
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.id))}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      },
    );
    setIsBusy(false);

    if (!response.ok) {
      setMessage(`Failed to update pull request: ${response.status}`);
      return;
    }

    const nextPullRequest = (await response.json()) as PullRequest;
    setPullRequest(nextPullRequest);
    setLabelInput(joinLabels(nextPullRequest.labels));
    setMessage(status === "closed" ? "Pull request closed." : "Pull request reopened.");
    router.refresh();
  }

  async function mergePullRequest() {
    setIsBusy(true);
    setMessage("");
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.id))}/merge`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );
    setIsBusy(false);

    if (!response.ok) {
      setMessage(`Merge failed: ${response.status}`);
      return;
    }

    const nextPullRequest = (await response.json()) as PullRequest;
    setPullRequest(nextPullRequest);
    setLabelInput(joinLabels(nextPullRequest.labels));
    setMessage("Pull request merged.");
    router.refresh();
  }

  async function saveLabels() {
    setIsBusy(true);
    setMessage("");
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.id))}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ labels: labelList(labelInput) }),
      },
    );
    setIsBusy(false);

    if (!response.ok) {
      setMessage(`Failed to update labels: ${response.status}`);
      return;
    }

    const nextPullRequest = (await response.json()) as PullRequest;
    setPullRequest(nextPullRequest);
    setLabelInput(joinLabels(nextPullRequest.labels));
    setMessage("Pull request labels updated.");
    router.refresh();
  }

  return (
    <main className="grid gap-5">
      <a className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/pull-requests`}>
        Back to pull requests
      </a>

      <section className="grid gap-4 rounded-2xl border border-[#d0d7de] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <PullRequestStatus status={pullRequest.status} />
              <span className="text-sm text-[#59636e]">Opened {formatDate(pullRequest.created_at)}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{pullRequest.title}</h1>
            <p className="text-sm text-[#59636e]">
              {pullRequest.author_handle} wants to merge{" "}
              <BranchBadge>{pullRequest.source_branch}</BranchBadge> into{" "}
              <BranchBadge>{pullRequest.target_branch}</BranchBadge>
            </p>
            <RepositoryLabelBadges labels={pullRequest.labels} />
          </div>

          {pullRequest.viewer_can_update ? (
            <div className="flex flex-wrap gap-2">
              {pullRequest.status === "open" ? (
                <>
                  <button
                    className="rounded-lg border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white disabled:opacity-60"
                    disabled={isBusy}
                    type="button"
                    onClick={() => void mergePullRequest()}
                  >
                    {isBusy ? "Working..." : "Merge pull request"}
                  </button>
                  <button
                    className="rounded-lg border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold text-[#cf222e] disabled:opacity-60"
                    disabled={isBusy}
                    type="button"
                    onClick={() => void updateStatus("closed")}
                  >
                    Close
                  </button>
                </>
              ) : null}
              {pullRequest.status === "closed" ? (
                <button
                  className="rounded-lg border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold disabled:opacity-60"
                  disabled={isBusy}
                  type="button"
                  onClick={() => void updateStatus("open")}
                >
                  Reopen
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-[#d8dee4] bg-[#f6f8fa] p-4">
          {pullRequest.body ? <MarkdownViewer content={pullRequest.body} variant="comment" /> : <p className="text-[#59636e]">No description provided.</p>}
        </div>

        {pullRequest.viewer_can_update ? (
          <div className="grid gap-2 rounded-xl border border-[#d8dee4] bg-[#f6f8fa] p-4">
            <div>
              <h2 className="font-semibold">Labels</h2>
              <p className="text-sm text-[#59636e]">Use commas to assign or clear pull request labels.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded-md border border-[#d0d7de] bg-white px-3 py-2"
                placeholder="bug, enhancement"
                value={labelInput}
                onChange={(event) => setLabelInput(event.target.value)}
              />
              <button
                className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-semibold disabled:opacity-60"
                disabled={isBusy}
                type="button"
                onClick={() => void saveLabels()}
              >
                Save labels
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}

      <ConversationPanel activity={initialActivity} activityUrl={activityUrl} attachmentUploadUrl={attachmentUploadUrl} commentsUrl={commentsUrl} />
    </main>
  );
}

function PullRequestStatus({ status }: { status: PullRequest["status"] }) {
  const tone = status === "merged" ? "bg-[#8250df] text-white" : status === "closed" ? "bg-[#cf222e] text-white" : "bg-[#1a7f37] text-white";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function BranchBadge({ children }: { children: string }) {
  return <span className="rounded-md bg-[#ddf4ff] px-1.5 py-0.5 font-mono text-xs text-[#0969da]">{children}</span>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function joinLabels(labels: PullRequest["labels"]) {
  return labels.map((label) => label.name).join(", ");
}

function labelList(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}
