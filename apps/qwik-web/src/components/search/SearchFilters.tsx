import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";

export const SEARCH_FILTERS = [
  { id: "code", label: "Code", enabled: false },
  { id: "repositories", label: "Repositories", enabled: true },
  { id: "issues", label: "Issues", enabled: false },
  { id: "pull-requests", label: "Pull requests", enabled: false },
  { id: "discussions", label: "Discussions", enabled: false },
  { id: "users", label: "Users", enabled: true },
] as const;

type SearchFiltersProps = {
  query: string;
  activeType: string;
};

export const SearchFilters = component$(
  ({ query, activeType }: SearchFiltersProps) => {
    return (
      <aside class="search-filters">
        {SEARCH_FILTERS.map((filter) => (
          <Link
            aria-disabled={!filter.enabled}
            class={filterClass(activeType === filter.id, filter.enabled)}
            href={
              filter.enabled
                ? `/search?q=${encodeURIComponent(query)}&type=${filter.id}`
                : "#"
            }
            key={filter.id}
          >
            <span>{filter.label}</span>
            {!filter.enabled ? <span class="search-filters__soon">soon</span> : null}
          </Link>
        ))}
      </aside>
    );
  },
);

function filterClass(active: boolean, enabled: boolean) {
  if (active) {
    return "search-filters__link search-filters__link--active";
  }

  if (enabled) {
    return "search-filters__link";
  }

  return "search-filters__link search-filters__link--disabled";
}
