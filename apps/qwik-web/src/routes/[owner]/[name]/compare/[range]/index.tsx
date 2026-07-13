import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { CommitCompareList } from "~/components/repository/CommitCompareList";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { CodeDiff } from "~/components/repository/code/CodeDiff";
import { compareRefs, getRepository, listPullRequests } from "~/lib/api";

export const useCompareTagsPage = routeLoader$(async ({ params }) => {
  const decodedRange = params.range;
  const [base = "", head = ""] = decodedRange.split("...");
  const [repo, pullRequests, compare] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    compareRefs(params.owner, params.name, decodedRange),
  ]);

  return {
    base,
    compare,
    head,
    pullRequestsCount: pullRequests.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = useCompareTagsPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <section class="compare-page__hero">
          <div>
            <h2 class="compare-page__title">Compare tags</h2>
            <p class="issue-detail-page__meta">
              Comparing <RefBadge label={route.value.base} /> to{" "}
              <RefBadge label={route.value.head} />
            </p>
          </div>
          <div class="compare-page__stats">
            <span>{route.value.compare.ahead_by} commits ahead</span>
            <span>{route.value.compare.behind_by} commits behind</span>
            <span class="pull-request-flow__status-pill">
              {route.value.compare.status.replaceAll("_", " ")}
            </span>
          </div>
        </section>

        <div class="compare-page__lists">
          <CommitCompareList
            commits={route.value.compare.ahead_commits}
            emptyLabel="No commits ahead."
            title="Ahead commits"
          />
          <CommitCompareList
            commits={route.value.compare.behind_commits}
            emptyLabel="No commits behind."
            title="Behind commits"
          />
        </div>

        <CodeDiff
          emptyLabel="No diff to show between these tags."
          files={route.value.compare.files}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Compare Tags · Diggit",
};

const RefBadge = component$(({ label }: { label: string }) => {
  return <span class="pull-request-detail-page__branch-badge">{label}</span>;
});
