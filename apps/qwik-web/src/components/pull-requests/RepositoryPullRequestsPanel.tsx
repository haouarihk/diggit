import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";

import { RepoQueryToolbar } from "~/components/repository/RepoQueryToolbar";
import { RepositoryLabelBadges } from "~/components/repository/RepositoryLabelBadges";
import type { IssueLabel, PaginatedCollection, PullRequest } from "~/lib/api";
import {
  buildListHref,
  parsePullRequestSearchQuery,
  setPullRequestSearchStatusQuery,
  togglePullRequestSearchLabelQuery,
} from "~/lib/repo-list-query";

type RepositoryPullRequestsPanelProps = {
  baseHref: string;
  labels: IssueLabel[];
  pagination: PaginatedCollection<PullRequest>["pagination"];
  pullRequests: PullRequest[];
  query: string;
};

export const RepositoryPullRequestsPanel = component$(
  ({
    baseHref,
    labels,
    pagination,
    pullRequests,
    query,
  }: RepositoryPullRequestsPanelProps) => {
    const searchState = parsePullRequestSearchQuery(query);

    return (
      <section class="repository-list-page">
        <RepoQueryToolbar
          description="Review proposed branch changes for this repository."
          filterMenu={{
            items: [
              {
                active: searchState.status === "open",
                description: "Show open pull requests",
                href: pullRequestListHref(baseHref, {
                  q: setPullRequestSearchStatusQuery(query, "open"),
                }),
                label: "Open",
              },
              {
                active: searchState.status === "closed",
                description: "Show closed pull requests",
                href: pullRequestListHref(baseHref, {
                  q: setPullRequestSearchStatusQuery(query, "closed"),
                }),
                label: "Closed",
              },
              {
                active: searchState.status === "merged",
                description: "Show merged pull requests",
                href: pullRequestListHref(baseHref, {
                  q: setPullRequestSearchStatusQuery(query, "merged"),
                }),
                label: "Merged",
              },
              {
                active: searchState.status === null,
                description: "Show pull requests across every status",
                href: pullRequestListHref(baseHref, {
                  q: setPullRequestSearchStatusQuery(query, null),
                }),
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
              items: labels.map((label) => ({
                active: searchState.labels.some(
                  (selectedLabel) =>
                    selectedLabel.toLowerCase() === label.name.toLowerCase(),
                ),
                color: label.color,
                href: pullRequestListHref(baseHref, {
                  q: togglePullRequestSearchLabelQuery(query, label.name),
                }),
                label: label.name,
              })),
              label: "Labels",
            },
          ]}
          placeholder={'Search pull requests with is:open label:"feature"'}
          query={query}
          title="Pull requests"
          total={pagination.total}
        >
          <Link
            q:slot="action"
            class="repository-list-page__primary-action"
            href={`${baseHref}/pull-requests/new`}
          >
            New pull request
          </Link>
        </RepoQueryToolbar>

        {pullRequests.length === 0 ? (
          <div class="repository-list-page__empty">
            <h3 class="repository-list-page__empty-title">
              No pull requests found
            </h3>
            <p class="repository-list-page__empty-copy">
              Open a pull request to propose changes from another branch or
              repository.
            </p>
          </div>
        ) : (
          <div class="repository-list-page__items">
            {pullRequests.map((pullRequest) => (
              <article class="repository-list-card" key={pullRequest.id}>
                <div class="repository-list-card__header">
                  <Link
                    class="repository-list-card__title"
                    href={`${baseHref}/pull/${encodeURIComponent(String(pullRequest.id))}`}
                  >
                    {pullRequest.title}
                  </Link>
                  <PullRequestStatusBadge status={pullRequest.status} />
                </div>
                <p class="repository-list-card__meta">
                  {pullRequest.author_handle} wants to merge{" "}
                  {pullRequest.source_branch} into {pullRequest.target_branch}
                </p>
                <RepositoryLabelBadges labels={pullRequest.labels} />
                {pullRequest.body ? (
                  <p class="repository-list-card__body">{pullRequest.body}</p>
                ) : null}
                <p class="repository-list-card__meta">
                  Updated {formatDate(pullRequest.updated_at)}
                </p>
              </article>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 ? (
          <div class="repository-list-page__pagination">
            <span class="repository-list-page__pagination-copy">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div class="repository-list-page__pagination-links">
              {pagination.page > 1 ? (
                <PageLink
                  href={pullRequestListHref(baseHref, {
                    page: pagination.page - 1,
                    q: query,
                  })}
                  label="Previous"
                />
              ) : null}
              {pagination.page < pagination.totalPages ? (
                <PageLink
                  href={pullRequestListHref(baseHref, {
                    page: pagination.page + 1,
                    q: query,
                  })}
                  label="Next"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    );
  },
);

const PullRequestStatusBadge = component$(
  ({ status }: { status: PullRequest["status"] }) => {
    const tone =
      status === "merged"
        ? "repository-status-badge--merged"
        : status === "closed"
          ? "repository-status-badge--closed"
          : "repository-status-badge--open";

    return <span class={["repository-status-badge", tone]}>{status}</span>;
  },
);

const PageLink = component$(({ href, label }: { href: string; label: string }) => {
  return (
    <Link class="repository-list-page__page-link" href={href}>
      {label}
    </Link>
  );
});

function pullRequestListHref(
  baseHref: string,
  params: { page?: number; q?: string },
) {
  return buildListHref(`${baseHref}/pull-requests`, {
    page: params.page,
    q: params.q,
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
