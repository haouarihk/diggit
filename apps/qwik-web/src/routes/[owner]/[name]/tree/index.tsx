import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { RepositoryCodeBrowser } from "~/components/repository/code/RepositoryCodeBrowser";
import { loadRepositoryCodeBrowser } from "../code-browser";

export const useRepositoryTreeRoute = routeLoader$(async ({ params, url }) => {
  return loadRepositoryCodeBrowser(params.owner, params.name, {
    mode: "tree",
    query: url.searchParams.get("q")?.trim() ?? "",
    ref: url.searchParams.get("ref"),
  });
});

export default component$(() => {
  const route = useRepositoryTreeRoute();

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
  const baseHref = `/${encodeURIComponent(repository.owner_handle)}/${encodeURIComponent(
    repository.name,
  )}`;

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={repository}
      />
      <RepoPageContent>
        <RepositoryCodeBrowser
          baseHref={baseHref}
          branches={route.value.branches}
          currentPath={route.value.currentPath}
          fullTree={route.value.fullTree}
          mode="tree"
          query={route.value.query}
          readme={route.value.readme}
          repo={repository}
          selectedRef={route.value.selectedRef}
          tags={route.value.tags}
          tree={route.value.tree}
        />
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Repository Files · Diggit",
};
