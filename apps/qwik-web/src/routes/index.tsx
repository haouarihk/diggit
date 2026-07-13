import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { RepositoryList } from "~/components/repositories/RepositoryList";
import { listRepositories, type Repository } from "~/lib/api";

export const useRepositories = routeLoader$(async ({ url }) => {
  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  const query = rawQuery.toLowerCase();
  const repos = await listRepositories().catch(() => ({ data: [] as Repository[] }));
  const visibleRepos = query
    ? repos.data.filter((repo) => {
        const haystack = [
          repo.owner_handle,
          repo.owner?.display_name ?? repo.owner_handle,
          repo.name,
          repo.description,
          repo.visibility,
          repo.remote_server ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : repos.data;

  return {
    query,
    rawQuery,
    visibleRepos,
  };
});

export default component$(() => {
  const repositories = useRepositories();
  const query = repositories.value.query;
  const rawQuery = repositories.value.rawQuery;

  return (
    <div class="home-page">
      <section class="home-hero">
        <p class="home-hero__eyebrow">Federated Git hosting</p>
        <h1 class="home-hero__title">Repositories</h1>
        <p class="home-hero__description">
          Discover local and federated repositories, create projects, and fork
          across servers.
        </p>
      </section>

      <div class="home-layout">
        <section>
          <div class="home-section-header">
            <span>Repository discovery</span>
            {query ? (
              <span class="home-section-header__filter">
                Filtering by "{rawQuery}"
              </span>
            ) : null}
          </div>
          <RepositoryList
            emptyLabel={
              query
                ? "No repositories matched your search."
                : "No repositories yet."
            }
            repositories={repositories.value.visibleRepos}
          />
        </section>

        <aside class="home-sidebar">
          <section class="home-sidebar-card">
            <h2 class="home-sidebar-card__title">Federation</h2>
            <p class="home-sidebar-card__text">
              Forks and pull requests can move server-to-server while
              repositories stay owned by their local namespace.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Diggit",
  meta: [
    {
      name: "description",
      content: "Federated Git hosting for cross-server forks and pull requests.",
    },
  ],
};
