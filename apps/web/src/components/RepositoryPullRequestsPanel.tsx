import Link from "next/link";
import { RepoQueryToolbar } from "@/components/RepoQueryToolbar";
import { RepositoryLabelBadges } from "@/components/RepositoryLabelBadges";
import { buildListHref, parsePullRequestSearchQuery, setPullRequestSearchStatusQuery, togglePullRequestSearchLabelQuery } from "@/lib/repo-list-query";
import type { IssueLabel, PaginatedCollection, PullRequest } from "@/lib/api";

type RepositoryPullRequestsPanelProps = {
  baseHref: string;
  labels: IssueLabel[];
  pagination: PaginatedCollection<PullRequest>["pagination"];
  pullRequests: PullRequest[];
  query: string;
};

export function RepositoryPullRequestsPanel({ baseHref, labels, pagination, pullRequests, query }: RepositoryPullRequestsPanelProps) {
  const searchState = parsePullRequestSearchQuery(query);

  return (
    <section>
      <RepoQueryToolbar
        action={
          <Link
            className="inline-flex rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]"
            href={`${baseHref}/pull-requests/new`}
          >
            New pull request
          </Link>
        }
        description="Review proposed branch changes for this repository."
        filterMenu={{
          icon: "filter",
          items: [
            {
              active: searchState.status === "open",
              description: "Show open pull requests",
              href: pullRequestListHref(baseHref, { q: setPullRequestSearchStatusQuery(query, "open") }),
              label: "Open",
            },
            {
              active: searchState.status === "closed",
              description: "Show closed pull requests",
              href: pullRequestListHref(baseHref, { q: setPullRequestSearchStatusQuery(query, "closed") }),
              label: "Closed",
            },
            {
              active: searchState.status === "merged",
              description: "Show merged pull requests",
              href: pullRequestListHref(baseHref, { q: setPullRequestSearchStatusQuery(query, "merged") }),
              label: "Merged",
            },
            {
              active: searchState.status === null,
              description: "Show pull requests across every status",
              href: pullRequestListHref(baseHref, { q: setPullRequestSearchStatusQuery(query, null) }),
              label: "All",
            },
          ],
          label: "Filters",
        }}
        formAction={`${baseHref}/pull-requests`}
        menus={[
          {
            count: labels.length,
            emptyLabel: "No labels created yet.",
            icon: "tag",
            items: labels.map((label) => ({
              active: searchState.labels.some((selectedLabel) => selectedLabel.toLowerCase() === label.name.toLowerCase()),
              color: label.color,
              href: pullRequestListHref(baseHref, { q: togglePullRequestSearchLabelQuery(query, label.name) }),
              label: label.name,
            })),
            label: "Labels",
          },
        ]}
        placeholder='Search pull requests with is:open label:"feature"'
        query={query}
        title="Pull requests"
        total={pagination.total}
      />

      {pullRequests.length === 0 ? (
        <div className="grid gap-2 p-6 text-center">
          <h3 className="text-lg font-semibold">No pull requests found</h3>
          <p className="text-[#59636e]">Open a pull request to propose changes from another branch or repository.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-12 p-4">
          {pullRequests.map((pullRequest) => (
            <article className="grid gap-3 border-2 border-black/10 p-4 dark:border-white/10" key={pullRequest.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="font-semibold text-[#0969da] hover:underline"
                  href={`${baseHref}/pull/${encodeURIComponent(String(pullRequest.id))}`}
                >
                  {pullRequest.title}
                </Link>
                <PullRequestStatusBadge status={pullRequest.status} />
              </div>
              <p className="text-[#59636e]">
                {pullRequest.author_handle} wants to merge {pullRequest.source_branch} into {pullRequest.target_branch}
              </p>
              <RepositoryLabelBadges labels={pullRequest.labels} />
              {pullRequest.body ? <p className="line-clamp-2 text-[#59636e]">{pullRequest.body}</p> : null}
              <p className="text-sm text-[#59636e]">Updated {formatDate(pullRequest.updated_at)}</p>
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
            {pagination.page > 1 ? <PageLink href={pullRequestListHref(baseHref, { page: pagination.page - 1, q: query })} label="Previous" /> : null}
            {pagination.page < pagination.totalPages ? <PageLink href={pullRequestListHref(baseHref, { page: pagination.page + 1, q: query })} label="Next" /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PullRequestStatusBadge({ status }: { status: PullRequest["status"] }) {
  const tone =
    status === "merged"
      ? "border-[#8250df] bg-[#fbefff] text-[#8250df]"
      : status === "closed"
        ? "border-[#cf222e] bg-[#ffebe9] text-[#cf222e]"
        : "border-[#1a7f37] bg-[#dafbe1] text-[#1a7f37]";

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{status}</span>;
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold text-[#1f2328]" href={href}>
      {label}
    </Link>
  );
}

function pullRequestListHref(baseHref: string, params: { page?: number; q?: string }) {
  return buildListHref(`${baseHref}/pull-requests`, { page: params.page, q: params.q });
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
