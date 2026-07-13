import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { RepositoryOverview } from "~/components/repository/RepositoryOverview";
import {
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

export const useRepositoryRoute = routeLoader$(async ({ params, url }) => {
  const repository = await getRepository(params.owner, params.name).catch(() => null);
  if (!repository) {
    return {
      repository: null,
    };
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  const selectedRef = url.searchParams.get("ref")?.trim() || repository.default_branch;
  const [pullRequests, branches, tags, stats, languages, contributors, tree] =
    await Promise.all([
      listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
        data: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      })),
      listRepositoryBranches(params.owner, params.name).catch(() => ({
        data: [{ name: repository.default_branch, is_default: true, commit_sha: null }],
      })),
      listRepositoryTags(params.owner, params.name).catch(() => ({ data: [] })),
      getRepositoryStats(params.owner, params.name, selectedRef).catch(() => ({
        branches_count: 0,
        commits_count: 0,
        releases_count: 0,
        tags_count: 0,
      })),
      listRepositoryLanguages(params.owner, params.name, selectedRef).catch(() => ({
        data: [],
      })),
      listRepositoryContributors(params.owner, params.name, selectedRef).catch(
        () => ({ data: [] }),
      ),
      getRepositoryTree(params.owner, params.name, selectedRef).catch(
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
  );

  return {
    repository,
    branches: branches.data,
    contributors: contributors.data,
    languages: languages.data,
    pullRequestsCount: pullRequests.pagination?.total ?? pullRequests.data.length,
    query,
    readme,
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
      <section class="repository-not-found">
        <h1 class="repository-not-found__title">Repository not found</h1>
        <p class="repository-not-found__text">
          The backend did not return a repository for this route.
        </p>
      </section>
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
