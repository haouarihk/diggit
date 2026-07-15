import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import {
  PrivateRepositoryNotFound,
} from "~/components/repository/PrivateRepositoryNotFound";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { RepositoryCodeBrowser } from "~/components/repository/code/RepositoryCodeBrowser";
import { authTokenFromCookie } from "~/lib/server-auth";
import {
  decodeCodeBrowserPath,
  loadRepositoryCodeBrowser,
} from "../../code-browser";

export const useRepositoryBlobRoute = routeLoader$(async ({ cookie, params, url }) => {
  return loadRepositoryCodeBrowser(params.owner, params.name, {
    authToken: authTokenFromCookie(cookie),
    currentPath: decodeCodeBrowserPath(params.path),
    mode: "blob",
    query: url.searchParams.get("q")?.trim() ?? "",
    ref: url.searchParams.get("ref"),
  });
});

export default component$(() => {
  const route = useRepositoryBlobRoute();

  if (!route.value.repository) {
    return <PrivateRepositoryNotFound />;
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
          file={route.value.file}
          fullTree={route.value.fullTree}
          mode="blob"
          query={route.value.query}
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
  title: "Repository File · Diggit",
};
