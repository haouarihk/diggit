import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { RepositoryList } from "~/components/repositories/RepositoryList";
import { type SearchResponse } from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

type SearchResultsProps = {
  activeType: string;
  results: SearchResponse | null;
};

export const SearchResults = component$(
  ({ activeType, results }: SearchResultsProps) => {
    if (!results) {
      return (
        <section class="search-empty-state">
          Search is unavailable right now.
        </section>
      );
    }

    return (
      <>
        <section class="search-summary">
          <p class="search-summary__text">{results.federated.description}</p>
          {results.parsed.unsupported_qualifiers.length > 0 ? (
            <p class="search-summary__text search-summary__text--spaced">
              Parsed but not indexed yet:{" "}
              {results.parsed.unsupported_qualifiers.join(", ")}
            </p>
          ) : null}
        </section>

        {activeType === "users" ? (
          <UserResults users={results.data.users} />
        ) : (
          <RepositoryList
            emptyLabel="No repositories matched your search."
            repositories={results.data.repositories}
          />
        )}
      </>
    );
  },
);

export const CodeSearchSyntax = component$(() => {
  return (
    <section class="search-code-syntax">
      <h2 class="search-code-syntax__title">GitHub-style code search syntax</h2>
      <div class="search-code-syntax__content">
        <p>
          Code indexing is not enabled yet, but the search grammar is reserved
          for these features.
        </p>
        <ul class="search-code-syntax__list">
          <li>Bare terms search content or path, and whitespace means `AND`.</li>
          <li>Use quotes for exact strings, like "sparse index".</li>
          <li>Use boolean operators: `AND`, `OR`, `NOT`, plus parentheses.</li>
          <li>
            Use qualifiers like `repo:owner/name`, `user:alice`, `org:acme`,
            `language:rust`, `path:src/**/*.ts`, `symbol:WithContext`.
          </li>
          <li>Use regex terms surrounded by slashes, like `/sparse.*index/`.</li>
        </ul>
      </div>
    </section>
  );
});

const UserResults = component$(
  ({ users }: { users: SearchResponse["data"]["users"] }) => {
    if (users.length === 0) {
      return <EmptyState label="No users matched your search." />;
    }

    return (
      <section class="user-results">
        <div class="user-results__header">User results</div>
        <div class="user-results__list">
          {users.map((user) => (
            <article class="user-results__item" key={user.id}>
              {user.avatar_url ? (
                <img
                  alt=""
                  class="user-results__avatar"
                  height={40}
                  src={user.avatar_url}
                  width={40}
                />
              ) : (
                <span class="user-results__avatar user-results__avatar--fallback">
                  {user.avatar_fallback}
                </span>
              )}
              <div>
                <Link
                  class="user-results__link"
                  href={userProfileHref(user.username)}
                >
                  {user.username}
                </Link>
                <p class="user-results__name">{user.display_name}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  },
);

const EmptyState = component$(({ label }: { label: string }) => {
  return <section class="search-empty-state">{label}</section>;
});
