import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { IssueDetailPanel } from "~/components/issues/IssueDetailPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  type ApiAuthOptions,
  getRepository,
  getRepositoryIssue,
  listPullRequests,
  listRepositoryIssueActivity,
  listRepositoryIssues,
  type ActivityItem,
  type Issue,
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositoryIssuePage = routeLoader$(async ({ cookie, params }) => {
  const authOptions: ApiAuthOptions = { authToken: authTokenFromCookie(cookie) };
  const issueNumber = Number.parseInt(params.number, 10);
  const [repo, pullRequests, issueCount, issue, activity] = await Promise.all([
    getRepository(params.owner, params.name, authOptions),
    listPullRequests(params.owner, params.name, { limit: 1 }, authOptions).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listRepositoryIssues(params.owner, params.name, {
      page: 1,
      limit: 1,
      status: "open",
    }, authOptions).catch(() => emptyIssues()),
    getRepositoryIssue(params.owner, params.name, issueNumber, authOptions),
    listRepositoryIssueActivity(
      params.owner,
      params.name,
      issueNumber,
      1,
      100,
      authOptions,
    ).catch(() => emptyActivity()),
  ]);

  return {
    activity: activity.data,
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    issue,
    issuesCount: issueCount.pagination.total,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = useRepositoryIssuePage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="issues"
        issuesCount={route.value.issuesCount}
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <IssueDetailPanel
          activity={route.value.activity}
          baseHref={route.value.baseHref}
          issue={route.value.issue}
          name={route.value.repo.name}
          owner={route.value.repo.owner_handle}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const route = resolveValue(useRepositoryIssuePage);
  return {
    title: `${route.issue.title} · ${route.repo.owner_handle}/${route.repo.name}#${route.issue.number}`,
  };
};

function emptyIssues() {
  return {
    data: [] as Issue[],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
  };
}

function emptyActivity() {
  return {
    data: [] as ActivityItem[],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
}
