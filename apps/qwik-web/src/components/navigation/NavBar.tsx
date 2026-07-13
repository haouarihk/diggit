import { $, component$ } from "@builder.io/qwik";
import { Link, useLocation, useNavigate } from "@builder.io/qwik-city";

export const NavBar = component$(() => {
  const location = useLocation();
  const nav = useNavigate();
  const pathname = location.url.pathname;
  const repositoryPage = isRepositoryPath(pathname);

  const submitSearch = $(async (event: SubmitEvent) => {
    const form = event.currentTarget as HTMLFormElement | null;
    if (!form) {
      return;
    }

    const data = new FormData(form);
    const query = String(data.get("q") ?? "").trim();
    if (!query) {
      await nav("/search");
      return;
    }

    const repoPath = query.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (repoPath) {
      await nav(
        `/${encodeURIComponent(repoPath[1])}/${encodeURIComponent(repoPath[2])}`,
      );
      return;
    }

    await nav(`/search?q=${encodeURIComponent(query)}&type=repositories`);
  });

  if (repositoryPage) {
    return null;
  }

  return (
    <header class="topbar">
      <div class="topbar__inner">
        <div class="topbar__left">
          <Link class="brand" href="/">
            <span class="brand__mark">D</span>
            <span class="brand__name">Diggit</span>
          </Link>

          <form class="global-search" onSubmit$={submitSearch} preventdefault:submit>
            <label class="sr-only" for="global-search">
              Search repositories, organizations, users
            </label>
            <span class="global-search__slash">/</span>
            <input
              class="global-search__input"
              id="global-search"
              name="q"
              placeholder="Search repositories, organizations, users..."
              type="search"
            />
            <kbd class="global-search__kbd">Enter</kbd>
          </form>
        </div>

        <nav aria-label="Primary" class="topbar__nav">
          <Link class={navLinkClass(pathname === "/" || repositoryPage)} href="/">
            Repositories
          </Link>
          <Link
            class={navLinkClass(pathname.startsWith("/organizations"))}
            href="/organizations"
          >
            Organizations
          </Link>
        </nav>

        <div class="topbar__actions">
          <Link class="topbar__signin" href="/auth">
            Sign in
          </Link>
          <Link class="topbar__signup" href="/auth">
            Sign up
          </Link>
        </div>
      </div>

      <div class="topbar__mobile-nav">
        <Link
          class={mobileNavLinkClass(pathname === "/" || repositoryPage)}
          href="/"
        >
          Repositories
        </Link>
        <Link
          class={mobileNavLinkClass(pathname.startsWith("/organizations"))}
          href="/organizations"
        >
          Organizations
        </Link>
      </div>
    </header>
  );
});

function isRepositoryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 2;
}

function navLinkClass(active: boolean) {
  return ["topbar__nav-link", active ? "topbar__nav-link--active" : ""];
}

function mobileNavLinkClass(active: boolean) {
  return [
    "topbar__mobile-link",
    active ? "topbar__mobile-link--active" : "",
  ];
}
