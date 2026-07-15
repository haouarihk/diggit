import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import {
  PrivateRepositoryNotFound,
} from "~/components/repository/PrivateRepositoryNotFound";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { RepositoryOverview } from "~/components/repository/RepositoryOverview";
import {
  isApiRequestError,
  type ApiAuthOptions,
  getRepository,
  getRepositoryStats,
  getRepositoryTree,
  listPullRequests,
  listRepositoryContributors,
  listRepositoryBranches,
  listRepositoryLanguages,
  listRepositoryTags,
  type RepositoryTree,
} from "~/lib/api";
import { getRepositoryReadme } from "~/lib/repository-readme";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositoryRoute = routeLoader$(async ({ cookie, params, request, url }) => {
  const authOptions: ApiAuthOptions = {
    authToken: authTokenFromCookie(cookie),
    forwardedHeaders: forwardedApiHeaders(request.headers),
  };
  const repositoryResult = await getRepository(params.owner, params.name, authOptions)
    .then((repository) => ({
      repository,
      repositoryState: "ready" as const,
      retryAfterSeconds: null,
    }))
    .catch((error) => {
      if (!isApiRequestError(error)) {
        throw error;
      }

      if (error.status === 429) {
        return {
          repository: null,
          repositoryState: "rate-limited" as const,
          retryAfterSeconds: error.retryAfterSeconds,
        };
      }

      if (error.status === 401 || error.status === 403 || error.status === 404) {
        return {
          repository: null,
          repositoryState: "not-found" as const,
          retryAfterSeconds: null,
        };
      }

      return {
        repository: null,
        repositoryState: "unavailable" as const,
        retryAfterSeconds: null,
      };
    });

  if (!repositoryResult.repository) {
    return repositoryResult;
  }

  const repository = repositoryResult.repository;

  const query = url.searchParams.get("q")?.trim() ?? "";
  const selectedRef = url.searchParams.get("ref")?.trim() || repository.default_branch;
  const [pullRequests, branches, tags, stats, languages, contributors, tree] =
    await Promise.all([
      listPullRequests(params.owner, params.name, { limit: 1 }, authOptions).catch(() => ({
        data: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      })),
      listRepositoryBranches(params.owner, params.name, authOptions).catch(() => ({
        data: [{ name: repository.default_branch, is_default: true, commit_sha: null }],
      })),
      listRepositoryTags(params.owner, params.name, authOptions).catch(() => ({
        data: [],
      })),
      getRepositoryStats(params.owner, params.name, selectedRef, authOptions).catch(
        () => ({
        branches_count: 0,
        commits_count: 0,
        releases_count: 0,
        tags_count: 0,
      }),
      ),
      listRepositoryLanguages(params.owner, params.name, selectedRef, authOptions).catch(
        () => ({
        data: [],
      }),
      ),
      listRepositoryContributors(
        params.owner,
        params.name,
        selectedRef,
        authOptions,
      ).catch(
        () => ({ data: [] }),
      ),
      getRepositoryTree(params.owner, params.name, selectedRef, undefined, {
        authToken: authOptions.authToken,
      }).catch(
        (): RepositoryTree => ({
          ref_name: selectedRef,
          last_commit: null,
          entries: [],
        }),
      ),
    ]);
  const readme = await getRepositoryReadme(
    params.owner,
    params.name,
    selectedRef,
    tree.entries,
    authOptions,
  );

  return {
    repository,
    repositoryState: "ready" as const,
    branches: branches.data,
    contributors: contributors.data,
    languages: languages.data,
    pullRequestsCount: pullRequests.pagination?.total ?? pullRequests.data.length,
    query,
    readme,
    retryAfterSeconds: null,
    selectedRef,
    stats,
    tags: tags.data,
    tree,
  };
});

export default component$(() => {
  const route = useRepositoryRoute();

  if (!route.value.repository) {
    return (
      <PrivateRepositoryNotFound
        retryAfterSeconds={route.value.retryAfterSeconds}
        variant={route.value.repositoryState}
      />
    );
  }

  const repository = route.value.repository;

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={repository}
      />
      <RepoPageContent>
        <RepositoryOverview
          baseHref={`/${encodeURIComponent(repository.owner_handle)}/${encodeURIComponent(repository.name)}`}
          branches={route.value.branches}
          contributors={route.value.contributors}
          languages={route.value.languages}
          pullRequestsCount={route.value.pullRequestsCount}
          query={route.value.query}
          readme={route.value.readme}
          repo={repository}
          selectedRef={route.value.selectedRef}
          stats={route.value.stats}
          tags={route.value.tags}
          tree={route.value.tree}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Repository · Diggit",
};

function forwardedApiHeaders(headers: Headers) {
  const forwarded = new Headers();

  for (const name of ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "user-agent"]) {
    const value = headers.get(name);
    if (value) {
      forwarded.set(name, value);
    }
  }

  return Array.from(forwarded.keys()).length > 0 ? forwarded : undefined;
}
