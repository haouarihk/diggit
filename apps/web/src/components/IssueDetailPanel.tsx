"use client";

import { ConversationPanel } from "@/components/ConversationPanel";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { IssueLabels } from "@/components/RepositoryIssuesPanel";
import { authHeaders } from "@/lib/auth-session";
import type { Issue, IssueComment } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = apiBaseUrl();

type IssueDetailPanelProps = {
  baseHref: string;
  comments: IssueComment[];
  issue: Issue;
  name: string;
  owner: string;
};

export function IssueDetailPanel({ baseHref, comments: initialComments, issue: initialIssue, name, owner }: IssueDetailPanelProps) {
  const router = useRouter();
  const [issue, setIssue] = useState(initialIssue);
  const [message, setMessage] = useState("");
  const commentsUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.number}/comments`;
  const attachmentUploadUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/comment-attachments`;

  async function setIssueStatus(nextStatus: "open" | "closed") {
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.number}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      setMessage(`Failed to update issue: ${response.status}`);
      return;
    }
    setIssue((await response.json()) as Issue);
    setMessage(`Issue ${nextStatus}.`);
    router.refresh();
  }

  return (
    <main className="grid gap-5">
      <a className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/issues`}>
        Back to issues
      </a>
      <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {issue.title} <span className="font-normal text-[#59636e]">#{issue.number}</span>
            </h1>
            <p className="mt-1 text-sm text-[#59636e]">
              Opened by {issue.author_display_name || issue.author_handle} {formatDate(issue.created_at)}
            </p>
          </div>
          <button
            className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-sm font-semibold"
            type="button"
            onClick={() => void setIssueStatus(issue.status === "open" ? "closed" : "open")}
          >
            {issue.status === "open" ? "Close issue" : "Reopen issue"}
          </button>
        </div>
        <IssueLabels labels={issue.labels} />
        {issue.body ? <MarkdownViewer content={issue.body} variant="comment" /> : <p className="text-[#59636e]">No description provided.</p>}
      </section>

      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}

      <ConversationPanel attachmentUploadUrl={attachmentUploadUrl} comments={initialComments} commentsUrl={commentsUrl} title="Comments" />
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
