"use client";

import { IssueLabels } from "@/components/RepositoryIssuesPanel";
import { authHeaders } from "@/lib/auth-session";
import type { Issue, IssueComment } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
  const [comments, setComments] = useState(initialComments);
  const [message, setMessage] = useState("");

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

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.number}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ body: form.get("body") }),
    });
    if (!response.ok) {
      setMessage(`Failed to comment: ${response.status}`);
      return;
    }
    formElement.reset();
    const body = (await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.number}/comments?limit=100`).then((res) => res.json())) as { data: IssueComment[] };
    setComments(body.data);
    setMessage("Comment added.");
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
        {issue.body ? <p className="whitespace-pre-wrap">{issue.body}</p> : <p className="text-[#59636e]">No description provided.</p>}
      </section>

      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}

      <section className="grid gap-3">
        <h2 className="font-semibold">Comments</h2>
        {comments.length === 0 ? (
          <p className="rounded-md border border-[#d0d7de] bg-white p-4 text-[#59636e]">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <article className="grid gap-2 rounded-md border border-[#d0d7de] bg-white p-4" key={comment.id}>
              <p className="text-sm text-[#59636e]">
                {comment.author_display_name || comment.author_handle} commented {formatDate(comment.created_at)}
              </p>
              <p className="whitespace-pre-wrap">{comment.body}</p>
            </article>
          ))
        )}
      </section>

      <form className="grid gap-3 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4" onSubmit={addComment}>
        <label className="grid gap-1.5">
          Add a comment
          <textarea className="min-h-28 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="body" required />
        </label>
        <button className="justify-self-end rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
          Comment
        </button>
      </form>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
