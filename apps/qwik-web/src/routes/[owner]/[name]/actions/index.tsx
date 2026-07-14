import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { getRepository, listPullRequests } from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositoryActionsPage = routeLoader$(async ({ cookie, params }) => {
  const authToken = authTokenFromCookie(cookie);
  const [repo, pullRequests] = await Promise.all([
    getRepository(params.owner, params.name, { authToken }),
    listPullRequests(params.owner, params.name, { limit: 1 }, { authToken }).catch(
      () => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      }),
    ),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    pullRequestsCount: pullRequests.pagination?.total ?? pullRequests.data.length,
    repo,
  };
});

export default component$(() => {
  const route = useRepositoryActionsPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="actions"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />

      <RepoPageContent>
        <section class="repository-actions-page">
          <div>
            <h2 class="repository-actions-page__title">Actions</h2>
            <p class="repository-actions-page__description">
              Manage repository automation and runner capacity.
            </p>
          </div>
          <Link
            class="settings-resource-panel__primary-button repository-actions-page__button"
            href={`${route.value.baseHref}/settings/runners`}
          >
            Manage runners
          </Link>
        </section>
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Repository Actions · Diggit",
};
