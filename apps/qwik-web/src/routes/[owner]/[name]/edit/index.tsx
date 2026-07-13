import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";

import { RepoHeader, RepoPageContent } from "~/components/repository/RepoHeader";
import { FileEditor } from "~/components/repository/code/FileEditor";
import { getRepository, getRepositoryFile, listPullRequests } from "~/lib/api";

export const useEditRepositoryFilePage = routeLoader$(async ({ params, url }) => {
  const file = url.searchParams.get("file") ?? undefined;
  const ref = url.searchParams.get("ref")?.trim() ?? undefined;
  const [repo, pullRequests] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
  ]);
  const selectedFile = file
    ? await getRepositoryFile(params.owner, params.name, file, ref).catch(() => null)
    : null;

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    fileHref:
      file && selectedFile
        ? fileBlobHref(params.owner, params.name, selectedFile.path, ref)
        : null,
    pullRequestsCount: pullRequests.pagination.total,
    ref,
    repo,
    selectedFile,
  };
});

export default component$(() => {
  const route = useEditRepositoryFilePage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />

      <RepoPageContent>
        {!route.value.selectedFile ? (
          <section class="release-form-page__shell">
            <h2 class="pull-request-flow__page-title">File not found</h2>
            <p class="issue-detail-page__meta">
              Choose a file from the Code tab before editing.
            </p>
          </section>
        ) : route.value.selectedFile.is_binary ? (
          <section class="release-form-page__shell">
            <h2 class="pull-request-flow__page-title">Binary files cannot be edited here</h2>
            <p class="issue-detail-page__meta">
              Use the file preview page to view or delete this file.
            </p>
            <a
              class="settings-resource-panel__secondary-button"
              href={route.value.fileHref ?? route.value.baseHref}
            >
              Back to file
            </a>
          </section>
        ) : (
          <section class="release-detail-page">
            <div>
              <h2 class="pull-request-flow__page-title">
                Edit {route.value.selectedFile.path}
              </h2>
              <p class="issue-detail-page__meta">
                Saving will create a commit on {route.value.repo.default_branch}.
              </p>
            </div>
            <FileEditor
              content={route.value.selectedFile.content}
              name={route.value.repo.name}
              owner={route.value.repo.owner_handle}
              path={route.value.selectedFile.path}
              redirectTo={route.value.fileHref ?? route.value.baseHref}
            />
          </section>
        )}
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Edit File · Diggit",
};

function fileBlobHref(owner: string, name: string, path: string, ref?: string) {
  const query = new URLSearchParams();
  if (ref) {
    query.set("ref", ref);
  }
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const search = query.toString();
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob/${encodedPath}${search ? `?${search}` : ""}`;
}
