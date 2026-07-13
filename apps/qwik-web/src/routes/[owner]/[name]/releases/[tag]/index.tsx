import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { ReleaseDetailPanel } from "~/components/releases/RepositoryReleasesPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getRelease,
  getRepository,
  listPullRequests,
  listReleases,
  listRepositoryTags,
} from "~/lib/api";

export const useRepositoryReleaseDetailPage = routeLoader$(async ({ params }) => {
  const [repo, pullRequests, release, releaseCount, tags] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    getRelease(params.owner, params.name, params.tag),
    listReleases(params.owner, params.name, {
      page: 1,
      limit: 1,
      status: "published",
    }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listRepositoryTags(params.owner, params.name).catch(() => ({ data: [] })),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    name: params.name,
    owner: params.owner,
    pullRequestsCount: pullRequests.pagination.total,
    release,
    releasesCount: releaseCount.pagination.total,
    repo,
    tags: tags.data,
  };
});

export default component$(() => {
  const route = useRepositoryReleaseDetailPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="releases"
        pullRequestsCount={route.value.pullRequestsCount}
        releasesCount={route.value.releasesCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <ReleaseDetailPanel
          baseHref={route.value.baseHref}
          name={route.value.name}
          owner={route.value.owner}
          release={route.value.release}
          tags={route.value.tags}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const route = resolveValue(useRepositoryReleaseDetailPage);
  return {
    title: `${route.release.title} · ${route.repo.owner_handle}/${route.repo.name}`,
  };
};
