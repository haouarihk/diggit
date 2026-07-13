import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { CommitCompareList } from "~/components/repository/CommitCompareList";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { SyncForkButton } from "~/components/repository/SyncForkButton";
import { CodeDiff } from "~/components/repository/code/CodeDiff";
import { compareUpstream, getRepository, listPullRequests } from "~/lib/api";

export const useCompareUpstreamPage = routeLoader$(async ({ params }) => {
  const [repo, pullRequests, compare] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    compareUpstream(params.owner, params.name),
  ]);

  return {
    compare,
    name: params.name,
    owner: params.owner,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = useCompareUpstreamPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <section class="compare-page__hero">
          <div class="compare-upstream__header">
            <div>
              <h2 class="compare-page__title">Compare with upstream</h2>
              <p class="issue-detail-page__meta">
                {route.value.compare.source ? (
                  <>
                    Original repository:{" "}
                    <a class="compare-upstream__source" href={route.value.compare.source.url}>
                      {route.value.compare.source.owner_handle}/{route.value.compare.source.name}
                    </a>
                  </>
                ) : (
                  "Original repository unavailable."
                )}
              </p>
            </div>
            {route.value.compare.behind_by > 0 ? (
              <SyncForkButton name={route.value.name} owner={route.value.owner} />
            ) : null}
          </div>

          {route.value.compare.status === "unavailable" ? (
            <p class="issue-detail-page__meta">
              {route.value.compare.message ?? "Upstream comparison is unavailable."}
            </p>
          ) : (
            <div class="compare-page__stats">
              <span>{route.value.compare.ahead_by} commits ahead</span>
              <span>{route.value.compare.behind_by} commits behind</span>
              <span class="pull-request-flow__status-pill">
                {route.value.compare.status.replaceAll("_", " ")}
              </span>
            </div>
          )}
        </section>

        <div class="compare-page__lists">
          <CommitCompareList
            commits={route.value.compare.ahead_commits}
            emptyLabel="No commits ahead of upstream."
            title="Ahead commits"
          />
          <CommitCompareList
            commits={route.value.compare.behind_commits}
            emptyLabel="No upstream commits to sync."
            title="Behind commits"
          />
        </div>

        <CodeDiff
          emptyLabel="No diff to show between this fork and upstream."
          files={route.value.compare.files}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Compare Upstream · Diggit",
};
