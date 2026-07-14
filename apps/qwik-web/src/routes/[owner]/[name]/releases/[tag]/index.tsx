import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { ReleaseDetailPanel } from "~/components/releases/RepositoryReleasesPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  type ApiAuthOptions,
  getRelease,
  getRepository,
  listPullRequests,
  listReleases,
  listRepositoryTags,
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositoryReleaseDetailPage = routeLoader$(async ({ cookie, params }) => {
  const authOptions: ApiAuthOptions = { authToken: authTokenFromCookie(cookie) };
  const [repo, pullRequests, release, releaseCount, tags] = await Promise.all([
    getRepository(params.owner, params.name, authOptions),
    listPullRequests(params.owner, params.name, { limit: 1 }, authOptions).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    getRelease(params.owner, params.name, params.tag, authOptions),
    listReleases(params.owner, params.name, {
      page: 1,
      limit: 1,
      status: "published",
    }, authOptions).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listRepositoryTags(params.owner, params.name, authOptions).catch(() => ({
      data: [],
    })),
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
