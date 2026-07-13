import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { RepositoryList } from "~/components/repositories/RepositoryList";
import { NewRepositoryButton } from "~/components/users/NewRepositoryButton";
import { getUser, listUserRepositories } from "~/lib/api";

export const useUserProfileRoute = routeLoader$(async ({ params, url }) => {
  const filters = {
    q: url.searchParams.get("q")?.trim() ?? "",
    sort: url.searchParams.get("sort")?.trim() ?? "updated",
    direction: url.searchParams.get("direction")?.trim() ?? "desc",
  };
  const [user, repos] = await Promise.all([
    getUser(params.owner),
    listUserRepositories(params.owner, filters).catch(() => ({ data: [] })),
  ]);

  return {
    filters,
    repos: repos.data,
    user,
  };
});

export default component$(() => {
  const route = useUserProfileRoute();
  const { filters, repos, user } = route.value;

  return (
    <div class="user-profile-page">
      <aside class="user-profile-page__sidebar">
        <section class="user-profile-card">
          {user.avatar_url ? (
            <img
              alt=""
              class="user-profile-card__avatar"
              height={128}
              src={user.avatar_url}
              width={128}
            />
          ) : (
            <span class="user-profile-card__avatar user-profile-card__avatar--fallback">
              {user.avatar_fallback}
            </span>
          )}
          <h1 class="user-profile-card__name">{user.display_name}</h1>
          <p class="user-profile-card__handle">@{user.username}</p>
        </section>
      </aside>

      <main class="user-profile-page__main">
        <div class="user-profile-page__header">
          <h2 class="user-profile-page__title">Repositories</h2>
          <NewRepositoryButton owner={user.username} ownerUserId={user.id} />
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
          emptyLabel="No repositories matched this profile."
          repositories={repos}
        />
      </main>
    </div>
  );
});

export const head: DocumentHead = {
  title: "User · Diggit",
};
