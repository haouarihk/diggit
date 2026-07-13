import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { RepositoryIssuesPanel } from "~/components/issues/RepositoryIssuesPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getRepository,
  listIssueLabels,
  listPullRequests,
  listRepositoryIssues,
  type Issue,
} from "~/lib/api";
import {
  getIssueSearchInput,
  parseIssueSearchQuery,
} from "~/lib/repo-list-query";

export const useRepositoryIssuesPage = routeLoader$(async ({ params, url }) => {
  const labels = url.searchParams.get("labels") ?? undefined;
  const page = url.searchParams.get("page") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const rawStatus = url.searchParams.get("status") ?? undefined;
  const searchQuery = getIssueSearchInput(q, { labels, status: rawStatus });
  const parsedQuery = parseIssueSearchQuery(searchQuery);
  const selectedPage = Number.parseInt(page ?? "1", 10) || 1;

  const [repo, pullRequests, issues, issueCount, issueLabels] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() =>
      emptyPullRequests(),
    ),
    listRepositoryIssues(params.owner, params.name, {
      labels: parsedQuery.labels.join(",") || undefined,
      limit: 25,
      page: selectedPage,
      q: parsedQuery.searchText || undefined,
      status: parsedQuery.status ?? "all",
    }).catch(() => emptyIssues(selectedPage)),
    listRepositoryIssues(params.owner, params.name, {
      limit: 1,
      page: 1,
      status: "open",
    }).catch(() => emptyIssues(1)),
    listIssueLabels(params.owner, params.name).catch(() => ({ data: [] })),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    issues: issues.data,
    issuesCount: issueCount.pagination.total,
    labels: issueLabels.data,
    pagination: issues.pagination,
    pullRequestsCount: pullRequests.pagination.total,
    query: searchQuery,
    repo,
  };
});

export default component$(() => {
  const route = useRepositoryIssuesPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="issues"
        issuesCount={route.value.issuesCount}
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <RepositoryIssuesPanel
          baseHref={route.value.baseHref}
          issues={route.value.issues}
          labels={route.value.labels}
          name={route.value.repo.name}
          owner={route.value.repo.owner_handle}
          pagination={route.value.pagination}
          query={route.value.query}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Issues · Diggit",
};

function emptyIssues(page: number) {
  return {
    data: [] as Issue[],
    pagination: {
      page,
      limit: 25,
      total: 0,
      totalPages: 0,
    },
  };
}

function emptyPullRequests() {
  return {
    data: [],
    pagination: {
      page: 1,
      limit: 1,
      total: 0,
      totalPages: 0,
    },
  };
}
