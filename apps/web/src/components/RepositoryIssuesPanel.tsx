"use client";

import { Drawer } from "@/components/Drawer";
import { RepoQueryToolbar } from "@/components/RepoQueryToolbar";
import { RepositoryLabelBadges } from "@/components/RepositoryLabelBadges";
import { authHeaders } from "@/lib/auth-session";
import { buildListHref, parseIssueSearchQuery, setIssueSearchStatusQuery, toggleIssueSearchLabelQuery } from "@/lib/repo-list-query";
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
};

export function RepositoryIssuesPanel({ baseHref, issues, labels, name, owner, pagination, query }: RepositoryIssuesPanelProps) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const searchState = parseIssueSearchQuery(query);

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
      <RepoQueryToolbar
        action={
          <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setIsCreateOpen(true)}>
            New issue
          </button>
        }
        description="Track bugs, ideas, and federated discussion for this repository."
        filterMenu={{
          icon: "filter",
          items: [
            {
              active: searchState.status === "open",
              description: "Show only open issues",
              href: issueListHref(baseHref, { q: setIssueSearchStatusQuery(query, "open") }),
              label: "Open",
            },
            {
              active: searchState.status === "closed",
              description: "Show only closed issues",
              href: issueListHref(baseHref, { q: setIssueSearchStatusQuery(query, "closed") }),
              label: "Closed",
            },
            {
              active: searchState.status === null,
              description: "Show issues across every status",
              href: issueListHref(baseHref, { q: setIssueSearchStatusQuery(query, null) }),
              label: "All",
            },
          ],
          label: "Filters",
        }}
        formAction={`${baseHref}/issues`}
        menus={[
          {
            count: labels.length,
            emptyLabel: "No labels created yet.",
            icon: "tag",
            items: labels.map((label) => ({
              active: searchState.labels.some((selectedLabel) => selectedLabel.toLowerCase() === label.name.toLowerCase()),
              color: label.color,
              href: issueListHref(baseHref, { q: toggleIssueSearchLabelQuery(query, label.name) }),
              label: label.name,
            })),
            label: "Labels",
          },
        ]}
        placeholder='Search issues with is:open label:"bug"'
        query={query}
        title="Issues"
        total={pagination.total}
      />

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
              <RepositoryLabelBadges labels={issue.labels} />
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
            {pagination.page > 1 ? <PageLink href={issueListHref(baseHref, { page: pagination.page - 1, q: query })} label="Previous" /> : null}
            {pagination.page < pagination.totalPages ? <PageLink href={issueListHref(baseHref, { page: pagination.page + 1, q: query })} label="Next" /> : null}
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

function issueListHref(baseHref: string, params: { page?: number; q?: string }) {
  return buildListHref(`${baseHref}/issues`, { page: params.page, q: params.q });
}

function labelList(value: string) {
  return value.split(",").map((label) => label.trim()).filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
