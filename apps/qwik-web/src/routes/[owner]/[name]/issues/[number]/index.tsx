import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { IssueDetailPanel } from "~/components/issues/IssueDetailPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getRepository,
  getRepositoryIssue,
  listPullRequests,
  listRepositoryIssueActivity,
  listRepositoryIssues,
  type ActivityItem,
  type Issue,
} from "~/lib/api";

export const useRepositoryIssuePage = routeLoader$(async ({ params }) => {
  const issueNumber = Number.parseInt(params.number, 10);
  const [repo, pullRequests, issueCount, issue, activity] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listRepositoryIssues(params.owner, params.name, {
      page: 1,
      limit: 1,
      status: "open",
    }).catch(() => emptyIssues()),
    getRepositoryIssue(params.owner, params.name, issueNumber),
    listRepositoryIssueActivity(params.owner, params.name, issueNumber, 1, 100).catch(
      () => emptyActivity(),
    ),
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
