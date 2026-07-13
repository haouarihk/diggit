import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { searchRepositories } from "~/lib/api";

export const useSearchResults = routeLoader$(async ({ url }) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type")?.trim() || "repositories";

  if (!query) {
    return {
      query,
      type,
      results: null,
    };
  }

  const results = await searchRepositories(query, type).catch(() => null);
  return {
    query,
    type,
    results,
  };
});

export default component$(() => {
  const search = useSearchResults();
  const repositories = search.value.results?.data.repositories ?? [];
  const users = search.value.results?.data.users ?? [];

  return (
    <div class="stack">
      <section class="hero stack">
        <span class="eyebrow">Representative route: Search</span>
        <h1>Search</h1>
        <p class="muted">
          The Qwik loader calls the Rust `/search` endpoint directly and keeps
          the current query in the URL.
        </p>
      </section>

      <form action="/search" class="panel grid">
        <label class="label">
          Query
          <input
            class="control"
            defaultValue={search.value.query}
            name="q"
            placeholder="repo:owner/name user:alice"
            type="search"
          />
        </label>
        <label class="label">
          Type
          <select class="control" name="type">
            <option
              selected={search.value.type === "repositories"}
              value="repositories"
            >
              Repositories
            </option>
            <option selected={search.value.type === "users"} value="users">
              Users
            </option>
          </select>
        </label>
        <button class="button" type="submit">
          Search
        </button>
      </form>

      {search.value.query ? (
        <>
          <section class="panel stack">
            <strong>Backend response</strong>
            <p class="muted">
              {search.value.results?.federated.description ??
                "Search is unavailable right now."}
            </p>
          </section>

          {search.value.type === "users" ? (
            <section class="list-panel">
              <div class="list-panel__header">Users</div>
              {users.length === 0 ? (
                <div class="list-panel__item muted">No users matched.</div>
              ) : (
                users.map((user) => (
                  <article class="list-panel__item stack" key={user.id}>
                    <strong>{user.username}</strong>
                    <span class="muted">{user.display_name}</span>
                  </article>
                ))
              )}
            </section>
          ) : (
            <section class="list-panel">
              <div class="list-panel__header">Repositories</div>
              {repositories.length === 0 ? (
                <div class="list-panel__item muted">
                  No repositories matched.
                </div>
              ) : (
                repositories.map((repo) => (
                  <article
                    class="list-panel__item stack"
                    key={`${repo.owner_handle}/${repo.name}`}
                  >
                    <Link
                      href={`/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`}
                    >
                      <strong>
                        {repo.owner_handle}/{repo.name}
                      </strong>
                    </Link>
                    <span class="muted">
                      {repo.description || "No description provided."}
                    </span>
                  </article>
                ))
              )}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Search · Diggit Qwik Prototype",
};
