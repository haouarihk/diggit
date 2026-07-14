import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { ReleaseEditPanel } from "~/components/releases/RepositoryReleasesPanel";
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
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useEditRepositoryReleasePage = routeLoader$(async ({ cookie, params }) => {
  const authOptions: ApiAuthOptions = { authToken: authTokenFromCookie(cookie) };
  const [repo, pullRequests, release, releaseCount] = await Promise.all([
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
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    name: params.name,
    owner: params.owner,
    pullRequestsCount: pullRequests.pagination.total,
    release,
    releasesCount: releaseCount.pagination.total,
    repo,
  };
});

export default component$(() => {
  const route = useEditRepositoryReleasePage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="releases"
        pullRequestsCount={route.value.pullRequestsCount}
        releasesCount={route.value.releasesCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <ReleaseEditPanel
          baseHref={route.value.baseHref}
          name={route.value.name}
          owner={route.value.owner}
          release={route.value.release}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Edit Release · Diggit",
};
