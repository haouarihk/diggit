"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Issue, IssueLabel, PaginatedCollection } from "@/lib/api";

const API_URL = apiBaseUrl();

type RepositoryIssuesPanelProps = {
  baseHref: string;
  issues: Issue[];
  labels: IssueLabel[];
  name: string;
  owner: string;
  pagination: PaginatedCollection<Issue>["pagination"];
  query: string;
  selectedLabels: string;
  status: "open" | "closed" | "all";
};

export function RepositoryIssuesPanel({ baseHref, issues, labels, name, owner, pagination, query, selectedLabels, status }: RepositoryIssuesPanelProps) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState("");

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
        labels: labelList(String(form.get("labels") ?? "")),
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

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Issues</h2>
          <p className="text-sm text-[#59636e]">Track bugs, ideas, and federated discussion for this repository.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-wrap gap-2">
            <IssueFilter active={status === "open"} href={issueListHref(baseHref, { labels: selectedLabels, q: query, status: "open" })} label="Open" />
            <IssueFilter active={status === "closed"} href={issueListHref(baseHref, { labels: selectedLabels, q: query, status: "closed" })} label="Closed" />
            <IssueFilter active={status === "all"} href={issueListHref(baseHref, { labels: selectedLabels, q: query, status: "all" })} label="All" />
          </div>
          <span className="text-[#59636e]">{pagination.total} total</span>
          <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setIsCreateOpen(true)}>
            New issue
          </button>
        </div>
      </div>

      <form className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]" action={`${baseHref}/issues`}>
        <input name="status" type="hidden" value={status} />
        <input className="rounded-md border border-[#d0d7de] bg-white px-3 py-2" defaultValue={query} name="q" placeholder="Search issues by name..." />
        <select className="rounded-md border border-[#d0d7de] bg-white px-3 py-2" defaultValue={selectedLabels} name="labels">
          <option value="">All tags</option>
          {labels.map((label) => (
            <option key={label.id} value={label.name}>
              {label.name}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-semibold" type="submit">
          Search
        </button>
      </form>

      {message ? <div className="px-4 py-2 text-sm text-[#59636e]">{message}</div> : null}

      {issues.length === 0 ? (
        <div className="grid gap-2 p-6 text-center">
          <h3 className="text-lg font-semibold">No issues found</h3>
          <p className="text-[#59636e]">Create an issue to start tracking work or discussion.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-12 p-4">
          {issues.map((issue) => (
            <article className="grid gap-3 border-2 border-black/10 p-4 dark:border-white/10" key={issue.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Link className="text-left font-semibold text-[#0969da] hover:underline" href={`${baseHref}/issues/${issue.number}`}>
                  {issue.title}
                </Link>
                <IssueStatus status={issue.status} />
              </div>
              <p className="text-sm text-[#59636e]">
                #{issue.number} opened by {issue.author_display_name || issue.author_handle} {formatDate(issue.created_at)}
              </p>
              <IssueLabels labels={issue.labels} />
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
            {pagination.page > 1 ? <PageLink href={issueListHref(baseHref, { labels: selectedLabels, page: pagination.page - 1, q: query, status })} label="Previous" /> : null}
            {pagination.page < pagination.totalPages ? <PageLink href={issueListHref(baseHref, { labels: selectedLabels, page: pagination.page + 1, q: query, status })} label="Next" /> : null}
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
          <label className="grid gap-1.5">
            Tags
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="labels" placeholder="bug, enhancement" />
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

export function IssueLabels({ labels }: { labels: IssueLabel[] }) {
  if (labels.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span className="rounded-full border border-[#d0d7de] px-2 py-0.5 text-xs font-semibold text-[#59636e]" key={label.id}>
          {label.name}
        </span>
      ))}
    </div>
  );
}

function issueListHref(baseHref: string, params: { labels?: string; page?: number; q?: string; status: string }) {
  const searchParams = new URLSearchParams({ status: params.status });
  if (params.page) searchParams.set("page", String(params.page));
  if (params.q) searchParams.set("q", params.q);
  if (params.labels) searchParams.set("labels", params.labels);
  return `${baseHref}/issues?${searchParams.toString()}`;
}

function labelList(value: string) {
  return value.split(",").map((label) => label.trim()).filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
