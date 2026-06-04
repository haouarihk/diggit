"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Issue, IssueComment, PaginatedCollection } from "@/lib/api";

const API_URL = apiBaseUrl();

type RepositoryIssuesPanelProps = {
  baseHref: string;
  issues: Issue[];
  name: string;
  owner: string;
  pagination: PaginatedCollection<Issue>["pagination"];
  status: "open" | "closed" | "all";
};

export function RepositoryIssuesPanel({ baseHref, issues, name, owner, pagination, status }: RepositoryIssuesPanelProps) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [message, setMessage] = useState("");

  async function loadComments(issue: Issue) {
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.number}/comments?limit=100`,
    );
    if (!response.ok) {
      setMessage(`Failed to load comments: ${response.status}`);
      return;
    }
    const body = (await response.json()) as PaginatedCollection<IssueComment>;
    setComments(body.data);
  }

  async function openIssue(issue: Issue) {
    setSelectedIssue(issue);
    setMessage("");
    await loadComments(issue);
  }

  async function createIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        title: form.get("title"),
        body: form.get("body"),
      }),
    });

    if (!response.ok) {
      setMessage(`Failed to create issue: ${response.status}`);
      return;
    }

    formElement.reset();
    setIsCreateOpen(false);
    setMessage("Issue created.");
    router.refresh();
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIssue) {
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${selectedIssue.number}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ body: form.get("body") }),
      },
    );

    if (!response.ok) {
      setMessage(`Failed to comment: ${response.status}`);
      return;
    }

    formElement.reset();
    setMessage("Comment added.");
    await loadComments(selectedIssue);
    router.refresh();
  }

  async function setIssueStatus(issue: Issue, nextStatus: "open" | "closed") {
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.number}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status: nextStatus }),
      },
    );

    if (!response.ok) {
      setMessage(`Failed to update issue: ${response.status}`);
      return;
    }

    const updatedIssue = (await response.json()) as Issue;
    setSelectedIssue(updatedIssue);
    setMessage(`Issue ${nextStatus}.`);
    router.refresh();
  }

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Issues</h2>
          <p className="text-sm text-[#59636e]">Track bugs, ideas, and federated discussion for this repository.</p>
        </div>
        <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setIsCreateOpen(true)}>
          New issue
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] px-4 py-3 text-sm">
        <div className="flex gap-2">
          <IssueFilter active={status === "open"} href={`${baseHref}/issues?status=open`} label="Open" />
          <IssueFilter active={status === "closed"} href={`${baseHref}/issues?status=closed`} label="Closed" />
          <IssueFilter active={status === "all"} href={`${baseHref}/issues?status=all`} label="All" />
        </div>
        <span className="text-[#59636e]">{pagination.total} total</span>
      </div>

      {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-sm text-[#59636e]">{message}</div> : null}

      {issues.length === 0 ? (
        <div className="grid gap-2 p-6 text-center">
          <h3 className="text-lg font-semibold">No issues found</h3>
          <p className="text-[#59636e]">Create an issue to start tracking work or discussion.</p>
        </div>
      ) : (
        <div className="grid">
          {issues.map((issue) => (
            <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={issue.id}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="text-left font-semibold text-[#0969da] hover:underline" type="button" onClick={() => void openIssue(issue)}>
                  {issue.title}
                </button>
                <IssueStatus status={issue.status} />
              </div>
              <p className="text-sm text-[#59636e]">
                #{issue.number} opened by {issue.author_display_name || issue.author_handle} {formatDate(issue.created_at)}
              </p>
              {issue.body ? <p className="line-clamp-2 text-[#59636e]">{issue.body}</p> : null}
            </article>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dee4] px-4 py-3 text-sm">
          <span className="text-[#59636e]">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <PageLink href={`${baseHref}/issues?status=${status}&page=${pagination.page - 1}`} label="Previous" /> : null}
            {pagination.page < pagination.totalPages ? <PageLink href={`${baseHref}/issues?status=${status}&page=${pagination.page + 1}`} label="Next" /> : null}
          </div>
        </div>
      ) : null}

      <Drawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} subtitle={`${owner}/${name}`} title="New issue">
        <form className="grid gap-4 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 sm:p-6" onSubmit={createIssue}>
          <label className="grid gap-1.5">
            Title
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="title" required />
          </label>
          <label className="grid gap-1.5">
            Body
            <textarea className="min-h-40 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="body" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </button>
            <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
              Create issue
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer
        isOpen={selectedIssue !== null}
        onClose={() => setSelectedIssue(null)}
        subtitle={selectedIssue ? `#${selectedIssue.number} ${selectedIssue.status}` : undefined}
        title={selectedIssue?.title ?? "Issue"}
      >
        {selectedIssue ? (
          <div className="grid gap-5">
            <article className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#59636e]">
                  Opened by {selectedIssue.author_display_name || selectedIssue.author_handle} {formatDate(selectedIssue.created_at)}
                </p>
                <button
                  className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-sm font-semibold"
                  type="button"
                  onClick={() => void setIssueStatus(selectedIssue, selectedIssue.status === "open" ? "closed" : "open")}
                >
                  {selectedIssue.status === "open" ? "Close issue" : "Reopen issue"}
                </button>
              </div>
              {selectedIssue.body ? <p className="whitespace-pre-wrap">{selectedIssue.body}</p> : <p className="text-[#59636e]">No description provided.</p>}
            </article>

            <section className="grid gap-3">
              <h3 className="font-semibold">Comments</h3>
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
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}

function IssueFilter({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link className={`rounded-md px-3 py-1.5 font-semibold ${active ? "bg-[#0969da] text-white" : "border border-[#d0d7de] bg-white text-[#59636e]"}`} href={href}>
      {label}
    </Link>
  );
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold text-[#1f2328]" href={href}>
      {label}
    </Link>
  );
}

function IssueStatus({ status }: { status: Issue["status"] }) {
  return <span className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 text-xs font-semibold text-[#59636e]">{status}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
