import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { ReleaseCreatePanel } from "~/components/releases/RepositoryReleasesPanel";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  type ApiAuthOptions,
  getRepository,
  listPullRequests,
  listReleases,
  listRepositoryBranches,
  listRepositoryTags,
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useNewRepositoryReleasePage = routeLoader$(async ({ cookie, params }) => {
  const authOptions: ApiAuthOptions = { authToken: authTokenFromCookie(cookie) };
  const [repo, pullRequests, releaseCount, tags, branches] = await Promise.all([
    getRepository(params.owner, params.name, authOptions),
    listPullRequests(params.owner, params.name, { limit: 1 }, authOptions).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
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
    listRepositoryBranches(params.owner, params.name, authOptions).catch(() => ({
      data: [],
    })),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    branches: branches.data,
    name: params.name,
    owner: params.owner,
    pullRequestsCount: pullRequests.pagination.total,
    releasesCount: releaseCount.pagination.total,
    repo,
    tags: tags.data,
  };
});

export default component$(() => {
  const route = useNewRepositoryReleasePage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="releases"
        pullRequestsCount={route.value.pullRequestsCount}
        releasesCount={route.value.releasesCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <ReleaseCreatePanel
          baseHref={route.value.baseHref}
          branches={route.value.branches}
          name={route.value.name}
          owner={route.value.owner}
          tags={route.value.tags}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "New Release · Diggit",
};
