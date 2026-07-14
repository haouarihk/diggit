import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { PullRequestSourceStep } from "~/components/pull-requests/PullRequestFlow";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { getPullRequestOptions, getRepository, listPullRequests } from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useNewPullRequestPage = routeLoader$(async ({ cookie, params }) => {
  const authToken = authTokenFromCookie(cookie);
  const [repo, pullRequests, options] = await Promise.all([
    getRepository(params.owner, params.name, { authToken }),
    listPullRequests(params.owner, params.name, { limit: 1 }, { authToken }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    getPullRequestOptions(params.owner, params.name, { authToken }),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    options,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = useNewPullRequestPage();

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
              Compare a source repository and branch with this repository.
            </p>
          </div>
          <PullRequestSourceStep
            baseHref={route.value.baseHref}
            options={route.value.options}
          />
        </section>
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "New Pull Request · Diggit",
};
