import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { RepositoryPullRequestsPanel } from "~/components/pull-requests/RepositoryPullRequestsPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  type ApiAuthOptions,
  getRepository,
  listIssueLabels,
  listPullRequests,
  type PullRequest,
} from "~/lib/api";
import {
  getPullRequestSearchInput,
  parsePullRequestSearchQuery,
} from "~/lib/repo-list-query";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositoryPullRequestsPage = routeLoader$(
  async ({ cookie, params, url }) => {
    const authOptions: ApiAuthOptions = { authToken: authTokenFromCookie(cookie) };
    const page = url.searchParams.get("page") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;
    const query = getPullRequestSearchInput(q);
    const parsedQuery = parsePullRequestSearchQuery(query);
    const selectedPage = Number.parseInt(page ?? "1", 10) || 1;

    const repo = await getRepository(params.owner, params.name, authOptions);
    const [pullRequestCount, pullRequests, labels] = await Promise.all([
      listPullRequests(params.owner, params.name, { limit: 1 }, authOptions).catch(() =>
        emptyPullRequests(1),
      ),
      listPullRequests(params.owner, params.name, {
        labels: parsedQuery.labels.join(",") || undefined,
        limit: 25,
        page: selectedPage,
        q: parsedQuery.searchText || undefined,
        status: parsedQuery.status ?? "all",
      }, authOptions).catch(() => emptyPullRequests(selectedPage)),
      listIssueLabels(params.owner, params.name, authOptions).catch(() => ({
        data: [],
      })),
    ]);

    return {
      baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
      labels: labels.data,
      pagination: pullRequests.pagination,
      pullRequests: pullRequests.data,
      pullRequestsCount: pullRequestCount.pagination.total,
      query,
      repo,
    };
  },
);

export default component$(() => {
  const route = useRepositoryPullRequestsPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="pull-requests"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <RepositoryPullRequestsPanel
          baseHref={route.value.baseHref}
          labels={route.value.labels}
          pagination={route.value.pagination}
          pullRequests={route.value.pullRequests}
          query={route.value.query}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Pull Requests · Diggit",
};

function emptyPullRequests(page: number) {
  return {
    data: [] as PullRequest[],
    pagination: {
      page,
      limit: 25,
      total: 0,
      totalPages: 0,
    },
  };
}
