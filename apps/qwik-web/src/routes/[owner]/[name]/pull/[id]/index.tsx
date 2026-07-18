import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { PullRequestDetailPanel } from "~/components/pull-requests/PullRequestDetailPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getPullRequest,
  getPullRequestMergeState,
  getRepository,
  listPullRequestActivity,
  listPullRequests,
  type ActivityItem,
  type PullRequestMergeState,
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const usePullRequestPage = routeLoader$(async ({ cookie, params }) => {
  const authToken = authTokenFromCookie(cookie);
  const [repo, pullRequests, pullRequest, mergeState, activity] = await Promise.all([
    getRepository(params.owner, params.name, { authToken }),
    listPullRequests(params.owner, params.name, { limit: 1 }, { authToken }).catch(
      () => ({
        data: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      }),
    ),
    getPullRequest(params.owner, params.name, params.id, { authToken }),
    getPullRequestMergeState(params.owner, params.name, params.id, { authToken }).catch(() =>
      unavailableMergeState(),
    ),
    listPullRequestActivity(
      params.owner,
      params.name,
      params.id,
      1,
      100,
      { authToken },
    ).catch(() => emptyActivity()),
  ]);

  return {
    activity: activity.data,
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    mergeState,
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
          mergeState={route.value.mergeState}
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

function unavailableMergeState(): PullRequestMergeState {
  return {
    status: "unavailable",
    message: "Merge state is temporarily unavailable.",
    can_resolve: false,
    can_force_rebase: false,
    current_label: "",
    incoming_label: "",
    files: [],
  };
}
