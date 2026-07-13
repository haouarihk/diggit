import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { RepositoryReleasesPanel } from "~/components/releases/RepositoryReleasesPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getRepository,
  listPullRequests,
  listReleases,
  listRepositoryTags,
  type Release,
} from "~/lib/api";
import {
  getReleaseSearchInput,
  parseReleaseSearchQuery,
} from "~/lib/repo-list-query";

export const useRepositoryReleasesPage = routeLoader$(async ({ params, url }) => {
  const page = url.searchParams.get("page") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const rawStatus = url.searchParams.get("status") ?? undefined;
  const status = releaseStatus(rawStatus);
  const query = getReleaseSearchInput(q);
  const parsedQuery = parseReleaseSearchQuery(query);
  const selectedPage = Number.parseInt(page ?? "1", 10) || 1;

  const [repo, pullRequests, releases, releaseCount, tags] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listReleases(params.owner, params.name, {
      page: selectedPage,
      limit: 25,
      prerelease: parsedQuery.isPrerelease || undefined,
      q: parsedQuery.searchText || undefined,
      status,
      tag: parsedQuery.tag || undefined,
    }).catch(() => emptyReleases(selectedPage)),
    listReleases(params.owner, params.name, {
      page: 1,
      limit: 1,
      status: "published",
    }).catch(() => emptyReleases(1)),
    listRepositoryTags(params.owner, params.name).catch(() => ({ data: [] })),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    name: params.name,
    owner: params.owner,
    pagination: releases.pagination,
    pullRequestsCount: pullRequests.pagination.total,
    query,
    releases: releases.data,
    releasesCount: releaseCount.pagination.total,
    repo,
    status,
    tags: tags.data,
  };
});

export default component$(() => {
  const route = useRepositoryReleasesPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="releases"
        pullRequestsCount={route.value.pullRequestsCount}
        releasesCount={route.value.releasesCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <RepositoryReleasesPanel
          baseHref={route.value.baseHref}
          name={route.value.name}
          owner={route.value.owner}
          pagination={route.value.pagination}
          query={route.value.query}
          releases={route.value.releases}
          status={route.value.status}
          tags={route.value.tags}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Releases · Diggit",
};

function releaseStatus(value?: string): "published" | "draft" | "all" {
  return value === "draft" || value === "all" ? value : "published";
}

function emptyReleases(page: number) {
  return {
    data: [] as Release[],
    pagination: {
      page,
      limit: 25,
      total: 0,
      totalPages: 0,
    },
  };
}
