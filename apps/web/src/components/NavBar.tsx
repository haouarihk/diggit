"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { CurrentUser } from "@/lib/api";
import { clearAuthSession, getAuthToken } from "@/lib/auth-session";

const API_URL = apiBaseUrl();

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  async function loadUser() {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }

    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      clearAuthSession();
      setUser(null);
      return;
    }

    setUser((await response.json()) as CurrentUser);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUser();
    }, 0);
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    function closeOtherDropdowns(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement) || !target.open) {
        return;
      }

      document.querySelectorAll("details[open]").forEach((details) => {
        if (details !== target) {
          details.removeAttribute("open");
        }
      });
    }

    function closeDropdownsOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      document.querySelectorAll("details[open]").forEach((details) => {
        if (!details.contains(target)) {
          details.removeAttribute("open");
        }
      });
    }

    function closeDropdownsOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      document.querySelectorAll("details[open]").forEach((details) => {
        details.removeAttribute("open");
      });
    }

    window.addEventListener("keydown", focusSearch);
    window.addEventListener("keydown", closeDropdownsOnEscape);
    window.addEventListener("diggit-auth-changed", loadUser);
    document.addEventListener("pointerdown", closeDropdownsOnOutsideClick);
    document.addEventListener("toggle", closeOtherDropdowns, true);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", focusSearch);
      window.removeEventListener("keydown", closeDropdownsOnEscape);
      window.removeEventListener("diggit-auth-changed", loadUser);
      document.removeEventListener("pointerdown", closeDropdownsOnOutsideClick);
      document.removeEventListener("toggle", closeOtherDropdowns, true);
    };
  }, []);

  function signOut() {
    clearAuthSession();
    setUser(null);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("q") ?? "").trim();

    if (!query) {
      router.push("/search");
      return;
    }

    const repoPath = query.match(/^([^/\s]+)\/([^/\s]+)$/);
    if (repoPath) {
      router.push(`/${encodeURIComponent(repoPath[1])}/${encodeURIComponent(repoPath[2])}`);
      return;
    }

    router.push(`/search?q=${encodeURIComponent(query)}&type=repositories`);
  }

  const isFederated = user?.kind === "federated";
  const homeServer = user?.home_server?.replace(/\/+$/, "");
  const profileHref = isFederated && homeServer ? `${homeServer}/users/${encodeURIComponent(user.username)}` : user ? `/users/${encodeURIComponent(user.username)}` : "#";
  const repositoriesHref = isFederated && homeServer ? `${homeServer}/users/${encodeURIComponent(user.username)}?tab=repositories` : user ? `/users/${encodeURIComponent(user.username)}?tab=repositories` : "#";
  const settingsHref = isFederated && homeServer ? `${homeServer}/settings` : "/settings";
  const runnersHref = isFederated && homeServer ? `${homeServer}/settings/runners` : "/settings/runners";
  const newRepositoryHref = isFederated && homeServer ? `${homeServer}/new/repository` : "/new/repository";
  const newOrganizationHref = isFederated && homeServer ? `${homeServer}/new/organization` : "/new/organization";

  return (
    <header className="-mx-6 mb-8 border-b border-[#d0d7de] bg-white">
      <div className="flex min-h-16 items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link className="group inline-flex items-center gap-2 font-semibold text-[#1f2328]" href="/">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#24292f] text-lg font-black text-white shadow-sm transition group-hover:bg-[#0969da]">
              D
            </span>
            <span className="text-lg font-bold tracking-tight">Diggit</span>
          </Link>

          <form className="hidden min-w-64 max-w-md flex-1 items-center rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-[#59636e] shadow-inner focus-within:border-[#0969da] focus-within:bg-white md:flex" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="global-search">
              Search repositories, organizations, users
            </label>
            <span className="mr-2 text-[#8c959f]">/</span>
            <input
              ref={searchInputRef}
              className="min-w-0 flex-1 bg-transparent text-[#1f2328] outline-none placeholder:text-[#59636e]"
              id="global-search"
              name="q"
              placeholder="Search repositories, organizations, users..."
              type="search"
            />
            <kbd className="ml-auto rounded border border-[#d0d7de] bg-white px-1.5 text-xs text-[#59636e]">
              Enter
            </kbd>
          </form>
        </div>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          <NavLink active={pathname === "/" || isRepoCodePath(pathname)} href="/">
            Repositories
          </NavLink>
          <NavLink active={pathname.startsWith("/organizations")} href="/organizations">
            Organizations
          </NavLink>
          {user ? (
            <NavLink active={pathname.startsWith("/settings/runners")} href={runnersHref}>
              Runners
            </NavLink>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <details className="group relative">
              <summary className="inline-flex cursor-pointer list-none rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-lg font-semibold leading-none text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]">
                +
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-md border border-[#d0d7de] bg-white py-1 shadow-lg">
                <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href={newRepositoryHref}>
                  New repository
                </Link>
                <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href={newOrganizationHref}>
                  New organization
                </Link>
              </div>
            </details>
          ) : null}
          {user?.is_admin ? (
            <Link className={`hidden rounded-md border px-3 py-1.5 font-semibold sm:inline-flex ${
              pathname.startsWith("/admin")
                ? "border-[#0969da] bg-[#ddf4ff] text-[#0969da]"
                : "border-[#d0d7de] bg-[#f6f8fa] text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]"
            }`} href="/admin">
              Admin
            </Link>
          ) : null}
          {user ? (
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-[#d0d7de] hover:bg-[#f6f8fa]">
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-8 w-8 rounded-full bg-[#d0d7de]" src={user.avatar_url} />
                ) : (
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#d0d7de] font-bold text-[#24292f]">
                    {user.avatar_fallback}
                  </span>
                )}
                <span className="hidden max-w-32 truncate font-semibold text-[#1f2328] sm:inline">
                  {user.username}
                </span>
                <span className="text-[#59636e]">▾</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-md border border-[#d0d7de] bg-white py-1 shadow-lg">
                <div className="border-b border-[#d8dee4] px-3 py-2">
                  <div className="text-xs text-[#59636e]">Signed in as</div>
                  <div className="truncate font-semibold">{user.username}</div>
                  {isFederated && homeServer ? <div className="truncate text-xs text-[#59636e]">{homeServer}</div> : null}
                </div>
                <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href={profileHref}>
                  Profile
                </Link>
                <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href={repositoriesHref}>
                  Repositories
                </Link>
                <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href="/organizations">
                  Organizations
                </Link>
                <div className="border-t border-[#d8dee4] py-1">
                  <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href={settingsHref}>
                    Settings
                  </Link>
                </div>
                {user.is_admin ? (
                  <Link className="block px-3 py-2 hover:bg-[#f6f8fa]" href="/admin">
                    Server admin
                  </Link>
                ) : null}
                <button className="block w-full cursor-pointer border-t border-[#d8dee4] px-3 py-2 text-left text-[#cf222e] hover:bg-[#fff8f8]" type="button" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </details>
          ) : (
            <>
              <Link className="hidden rounded-md px-3 py-1.5 font-semibold text-[#1f2328] hover:bg-[#f6f8fa] sm:inline-flex" href="/auth">
                Sign in
              </Link>
              <Link className="inline-flex rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]" href="/auth">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-[#d8dee4] px-6 py-2 md:hidden">
        <MobileNavLink active={pathname === "/" || isRepoCodePath(pathname)} href="/">
          Repositories
        </MobileNavLink>
        <MobileNavLink active={pathname.startsWith("/organizations")} href="/organizations">
          Organizations
        </MobileNavLink>
        {user ? (
          <MobileNavLink active={pathname.startsWith("/settings/runners")} href={runnersHref}>
            Runners
          </MobileNavLink>
        ) : null}
        {user?.is_admin ? (
          <MobileNavLink active={pathname.startsWith("/admin")} href="/admin">
            Admin
          </MobileNavLink>
        ) : null}
      </div>
    </header>
  );
}

function NavLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className={`rounded-md px-3 py-2 font-semibold ${
        active
          ? "bg-[#ddf4ff] text-[#0969da]"
          : "text-[#1f2328] hover:bg-[#f6f8fa] hover:text-[#0969da]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className={`whitespace-nowrap rounded-md px-3 py-1.5 font-semibold ${
        active ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#1f2328] hover:bg-[#f6f8fa]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function isRepoCodePath(pathname: string) {
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/new") ||
    pathname.startsWith("/organizations") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/users")
  ) {
    return false;
  }

  return pathname.split("/").filter(Boolean).length >= 2;
}
