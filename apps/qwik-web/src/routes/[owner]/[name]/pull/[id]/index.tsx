import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { PullRequestDetailPanel } from "~/components/pull-requests/PullRequestDetailPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getPullRequest,
  getRepository,
  listPullRequestActivity,
  listPullRequests,
  type ActivityItem,
} from "~/lib/api";

export const usePullRequestPage = routeLoader$(async ({ params }) => {
  const [repo, pullRequests, pullRequest, activity] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    getPullRequest(params.owner, params.name, params.id),
    listPullRequestActivity(params.owner, params.name, params.id, 1, 100).catch(
      () => emptyActivity(),
    ),
  ]);

  return {
    activity: activity.data,
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    pullRequest,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = usePullRequestPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="pull-requests"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <PullRequestDetailPanel
          activity={route.value.activity}
          baseHref={route.value.baseHref}
          name={route.value.repo.name}
          owner={route.value.repo.owner_handle}
          pullRequest={route.value.pullRequest}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const route = resolveValue(usePullRequestPage);
  return {
    title: `${route.pullRequest.title} · ${route.repo.owner_handle}/${route.repo.name}#${route.pullRequest.id}`,
  };
};

function emptyActivity() {
  return {
    data: [] as ActivityItem[],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
}
