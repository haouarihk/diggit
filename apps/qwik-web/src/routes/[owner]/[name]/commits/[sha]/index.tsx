import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { RepoHeader, RepoPageContent } from "~/components/repository/RepoHeader";
import { CodeDiff } from "~/components/repository/code/CodeDiff";
import { getCommit, getRepository, listPullRequests } from "~/lib/api";

export const useCommitDetailPage = routeLoader$(async ({ params, url }) => {
  const focusPath = url.searchParams.get("path") ?? undefined;
  const [repo, pullRequests, detail] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    getCommit(params.owner, params.name, params.sha),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    detail,
    focusPath,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = useCommitDetailPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <section class="compare-page__hero">
          <a class="issue-detail-page__back" href={`${route.value.baseHref}/commits`}>
            Back to commits
          </a>
          <h2 class="compare-page__title">{route.value.detail.commit.message}</h2>
          <div class="compare-page__stats">
            <span>{route.value.detail.commit.author_name}</span>
            <span>{formatDate(route.value.detail.commit.created_at)}</span>
            <span class="compare-commits__sha">{route.value.detail.commit.sha}</span>
          </div>
          {route.value.detail.parents.length > 0 ? (
            <p class="issue-detail-page__meta">
              Parent {route.value.detail.parents.map((parent) => parent.slice(0, 12)).join(", ")}
            </p>
          ) : null}
        </section>

        <CodeDiff files={route.value.detail.files} focusPath={route.value.focusPath} />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Commit Detail · Diggit",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
