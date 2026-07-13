import { Slot, component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";

export type RepoToolbarMenuItem = {
  active?: boolean;
  color?: string;
  description?: string;
  href: string;
  label: string;
};

export type RepoToolbarMenu = {
  count?: number;
  emptyLabel?: string;
  items: RepoToolbarMenuItem[];
  label: string;
};

type RepoQueryToolbarProps = {
  description: string;
  filterMenu: RepoToolbarMenu;
  formAction: string;
  hiddenFields?: Array<{ name: string; value: string }>;
  menus?: RepoToolbarMenu[];
  placeholder: string;
  query: string;
  title: string;
  total: number;
};

export const RepoQueryToolbar = component$(
  ({
    description,
    filterMenu,
    formAction,
    hiddenFields = [],
    menus = [],
    placeholder,
    query,
    title,
    total,
  }: RepoQueryToolbarProps) => {
    return (
      <div class="repo-query-toolbar">
        <div class="repo-query-toolbar__header">
          <div class="repo-query-toolbar__copy">
            <div class="repo-query-toolbar__title-row">
              <h2 class="repo-query-toolbar__title">{title}</h2>
              <span class="repo-query-toolbar__count">{total}</span>
            </div>
            <p class="repo-query-toolbar__description">{description}</p>
          </div>
          <div class="repo-query-toolbar__action">
            <Slot name="action" />
          </div>
        </div>

        <div class="repo-query-toolbar__controls">
          <form action={formAction} class="repo-query-toolbar__form">
            {hiddenFields.map((field) => (
              <input
                key={`${field.name}-${field.value}`}
                name={field.name}
                type="hidden"
                value={field.value}
              />
            ))}
            <ToolbarMenu compact menu={filterMenu} />
            <label class="repo-query-toolbar__search">
              <span class="repo-query-toolbar__search-icon" aria-hidden="true">
                Search
              </span>
              <input
                class="repo-query-toolbar__input"
                defaultValue={query}
                name="q"
                placeholder={placeholder}
              />
            </label>
            <button
              aria-label={`Search ${title.toLowerCase()}`}
              class="repo-query-toolbar__submit"
              type="submit"
            >
              Go
            </button>
          </form>

          {menus.length > 0 ? (
            <div class="repo-query-toolbar__menus">
              {menus.map((menu) => (
                <ToolbarMenu key={menu.label} menu={menu} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

const ToolbarMenu = component$(
  ({ compact = false, menu }: { compact?: boolean; menu: RepoToolbarMenu }) => {
    return (
      <details class="repo-toolbar-menu" data-ui-dropdown="true">
        <summary
          class={[
            "repo-toolbar-menu__summary",
            compact ? "repo-toolbar-menu__summary--compact" : "",
          ]}
        >
          <span>{menu.label}</span>
          {typeof menu.count === "number" ? (
            <span class="repo-toolbar-menu__count">{menu.count}</span>
          ) : null}
          <span aria-hidden="true">v</span>
        </summary>

        <div class="repo-toolbar-menu__panel">
          {menu.items.length === 0 ? (
            <p class="repo-toolbar-menu__empty">
              {menu.emptyLabel ?? "No options available."}
            </p>
          ) : (
            menu.items.map((item) => (
              <Link
                key={item.href}
                class={[
                  "repo-toolbar-menu__item",
                  item.active ? "repo-toolbar-menu__item--active" : "",
                ]}
                href={item.href}
              >
                <span class="repo-toolbar-menu__item-title">
                  {item.color ? (
                    <span
                      class="repo-toolbar-menu__swatch"
                      style={{ backgroundColor: item.color }}
                    />
                  ) : null}
                  <span>{item.label}</span>
                </span>
                {item.description ? (
                  <span class="repo-toolbar-menu__item-description">
                    {item.description}
                  </span>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </details>
    );
  },
);
