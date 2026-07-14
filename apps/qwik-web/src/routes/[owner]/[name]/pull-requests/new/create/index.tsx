import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { PullRequestCreateForm } from "~/components/pull-requests/PullRequestFlow";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  comparePullRequestBranches,
  getRepository,
  listPullRequests,
  type RepositoryCompare,
} from "~/lib/api";
import { decodePullRequestSource } from "~/lib/pull-request-flow";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useCreatePullRequestPage = routeLoader$(async ({ cookie, params, url }) => {
  const authToken = authTokenFromCookie(cookie);
  const from = url.searchParams.get("from") ?? undefined;
  const targetBranch = url.searchParams.get("targetBranch") ?? undefined;
  const [repo, pullRequests] = await Promise.all([
    getRepository(params.owner, params.name, { authToken }),
    listPullRequests(params.owner, params.name, { limit: 1 }, { authToken }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
  ]);
  const selection = decodePullRequestSource(from);
  const compare =
    selection && targetBranch
      ? await comparePullRequestBranches(params.owner, params.name, {
          source_branch: selection.branch,
          source_repo_url: selection.url,
          source_repository_id: selection.repositoryId,
          target_branch: targetBranch,
        }, { authToken }).catch(() => null)
      : null;
  const defaultTitle =
    selection && targetBranch
      ? defaultPullRequestTitle(selection.branch, targetBranch, compare)
      : "";

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    defaultTitle,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
    selection,
    targetBranch,
  };
});

export default component$(() => {
  const route = useCreatePullRequestPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="pull-requests"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <section class="pull-request-flow__page">
          <div>
            <h2 class="pull-request-flow__page-title">New pull request</h2>
            <p class="issue-detail-page__meta">
              Add the final details and create the pull request.
            </p>
          </div>

          {route.value.selection && route.value.targetBranch ? (
            <PullRequestCreateForm
              baseHref={route.value.baseHref}
              defaultTitle={route.value.defaultTitle}
              name={route.value.repo.name}
              owner={route.value.repo.owner_handle}
              selection={route.value.selection}
              targetBranch={route.value.targetBranch}
            />
          ) : (
            <div class="pull-request-flow__missing">
              <h3 class="pull-request-flow__missing-title">Choose branches first</h3>
              <p class="issue-detail-page__meta">
                A source and target branch are required before creating a pull request.
              </p>
              <Link
                class="settings-resource-panel__secondary-button"
                href={`${route.value.baseHref}/pull-requests/new`}
              >
                Start over
              </Link>
            </div>
          )}
        </section>
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Create Pull Request · Diggit",
};

function defaultPullRequestTitle(
  sourceBranch: string,
  targetBranch: string,
  compare: RepositoryCompare | null,
) {
  if (compare?.ahead_commits.length === 1) {
    return firstLine(compare.ahead_commits[0]?.message ?? "");
  }
  return `Merge from ${sourceBranch} to ${targetBranch}`;
}

function firstLine(value: string) {
  return value.split(/\r?\n/)[0]?.trim() || value.trim();
}
