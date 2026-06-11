"use client";

import { NavActions } from "@/components/NavActions";
import { useCurrentUser } from "@/components/useCurrentUser";
import { isRepositoryPath } from "@/lib/routes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, type ReactNode, useEffect, useRef } from "react";

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isRepositoryPage = isRepositoryPath(pathname);
  const { signOut, user } = useCurrentUser(!isRepositoryPage);

  useEffect(() => {
    if (isRepositoryPage) {
      return;
    }

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

    window.addEventListener("keydown", focusSearch);
    return () => {
      window.removeEventListener("keydown", focusSearch);
    };
  }, [isRepositoryPage]);

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

  if (isRepositoryPage) {
    return null;
  }

  const isFederated = user?.kind === "federated";
  const homeServer = user?.home_server?.replace(/\/+$/, "");
  const runnersHref = isFederated && homeServer ? `${homeServer}/settings/runners` : "/settings/runners";

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
          <NavLink active={pathname === "/" || isRepositoryPath(pathname)} href="/">
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

        <NavActions onSignOut={signOut} user={user} />
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-[#d8dee4] px-6 py-2 md:hidden">
        <MobileNavLink active={pathname === "/" || isRepositoryPath(pathname)} href="/">
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

