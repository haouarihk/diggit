import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { RepositoryList } from "~/components/repositories/RepositoryList";
import { NewRepositoryButton } from "~/components/users/NewRepositoryButton";
import {
  getOrganization,
  listOrganizationRepositories,
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useOrganizationRepositoriesRoute = routeLoader$(
  async ({ cookie, params, url }) => {
    const authToken = authTokenFromCookie(cookie);
    const filters = {
      q: url.searchParams.get("q")?.trim() ?? "",
      sort: url.searchParams.get("sort")?.trim() ?? "updated",
      direction: url.searchParams.get("direction")?.trim() ?? "desc",
    };
    const [organization, repos] = await Promise.all([
      getOrganization(params.org),
      listOrganizationRepositories(params.org, filters, { authToken }).catch(() => ({
        data: [],
      })),
    ]);

    return {
      filters,
      organization,
      repos: repos.data,
    };
  },
);

export default component$(() => {
  const route = useOrganizationRepositoriesRoute();
  const { filters, organization, repos } = route.value;

  return (
    <main class="organization-repositories-page">
      <div class="organization-repositories-page__header">
        <h2 class="organization-repositories-page__title">Repositories</h2>
        <NewRepositoryButton
          organizationCreatorId={organization.created_by}
          owner={organization.name}
        />
      </div>
      <form class="user-profile-filters">
        <input
          class="user-profile-filters__input"
          defaultValue={filters.q}
          name="q"
          placeholder="Find a repository..."
          type="search"
        />
        <select class="user-profile-filters__select" name="sort">
          <option selected={filters.sort === "updated"} value="updated">
            Last updated
          </option>
          <option selected={filters.sort === "stars"} value="stars">
            Stars
          </option>
          <option selected={filters.sort === "name"} value="name">
            Name
          </option>
        </select>
        <select class="user-profile-filters__select" name="direction">
          <option selected={filters.direction === "desc"} value="desc">
            Descending
          </option>
          <option selected={filters.direction === "asc"} value="asc">
            Ascending
          </option>
        </select>
        <button class="user-profile-filters__submit" type="submit">
          Filter
        </button>
      </form>
      <RepositoryList
        emptyLabel="No repositories matched this organization."
        repositories={repos}
      />
    </main>
  );
});

export const head: DocumentHead = {
  title: "Organization Repositories · Diggit",
};
