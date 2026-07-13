import { component$ } from "@builder.io/qwik";
import { type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { SEARCH_FILTERS, SearchFilters } from "~/components/search/SearchFilters";
import {
  CodeSearchSyntax,
  SearchResults,
} from "~/components/search/SearchResults";
import { searchRepositories } from "~/lib/api";

export const useSearchResults = routeLoader$(async ({ url }) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type")?.trim() || "repositories";
  const activeType = SEARCH_FILTERS.some((filter) => filter.id === type)
    ? type
    : "repositories";
  const results = await searchRepositories(query, activeType).catch(() => null);

  return {
    activeType,
    query,
    results,
  };
});

export default component$(() => {
  const search = useSearchResults();

  return (
    <div class="search-page">
      <section>
        <p class="search-page__eyebrow">Federated search</p>
        <h1 class="search-page__title">Search</h1>
        <p class="search-page__description">
          Search repositories and users across local records and known
          federated repository records.
        </p>
      </section>

      <form action="/search" class="search-form">
        <input
          class="search-form__input"
          defaultValue={search.value.query}
          name="q"
          placeholder={'repo:owner/name user:alice "exact phrase" NOT fork'}
          type="search"
        />
        <input name="type" type="hidden" value={search.value.activeType} />
        <button class="search-form__submit" type="submit">
          Search
        </button>
      </form>

      <div class="search-layout">
        <SearchFilters
          activeType={search.value.activeType}
          query={search.value.query}
        />

        <main class="search-results">
          {search.value.activeType === "code" ? <CodeSearchSyntax /> : null}
          <SearchResults
            activeType={search.value.activeType}
            results={search.value.results}
          />
        </main>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Search · Diggit",
  meta: [
    {
      name: "description",
      content:
        "Search repositories and users across local and federated Diggit records.",
    },
  ],
};
