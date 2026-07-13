"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { useCurrentUser } from "@/components/useCurrentUser";
import type { CurrentUser } from "@/lib/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

type NavActionsProps = {
  className?: string;
  onSignOut: () => void;
  status: "anonymous" | "authenticated" | "loading";
  user: CurrentUser | null;
};

export function CurrentUserNavActions({ className }: { className?: string }) {
  const { signOut, status, user } = useCurrentUser();

  return <NavActions className={className} onSignOut={signOut} status={status} user={user} />;
}

export function NavActions({ className = "", onSignOut, status, user }: NavActionsProps) {
  const pathname = usePathname();
  useDismissOpenDetails();

  const isFederated = user?.kind === "federated";
  const homeServer = user?.home_server?.replace(/\/+$/, "");
  const profileHref = isFederated && homeServer ? `${homeServer}/users/${encodeURIComponent(user.username)}` : user ? `/users/${encodeURIComponent(user.username)}` : "#";
  const repositoriesHref = isFederated && homeServer ? `${homeServer}/users/${encodeURIComponent(user.username)}?tab=repositories` : user ? `/users/${encodeURIComponent(user.username)}?tab=repositories` : "#";
  const settingsHref = isFederated && homeServer ? `${homeServer}/settings` : "/settings";
  const newRepositoryHref = isFederated && homeServer ? `${homeServer}/new/repository` : "/new/repository";
  const newOrganizationHref = isFederated && homeServer ? `${homeServer}/new/organization` : "/new/organization";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
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
            <button className="block w-full cursor-pointer border-t border-[#d8dee4] px-3 py-2 text-left text-[#cf222e] hover:bg-[#fff8f8]" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </details>
      ) : status === "loading" ? (
        <div className="flex items-center gap-2">
          <div className="hidden h-9 w-16 rounded-md bg-[#f6f8fa] sm:block" />
          <div className="h-9 w-20 rounded-md border border-[#d0d7de] bg-[#f6f8fa]" />
        </div>
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
  );
}

function useDismissOpenDetails() {
  useEffect(() => {
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

    window.addEventListener("keydown", closeDropdownsOnEscape);
    document.addEventListener("pointerdown", closeDropdownsOnOutsideClick);
    document.addEventListener("toggle", closeOtherDropdowns, true);
    return () => {
      window.removeEventListener("keydown", closeDropdownsOnEscape);
      document.removeEventListener("pointerdown", closeDropdownsOnOutsideClick);
      document.removeEventListener("toggle", closeOtherDropdowns, true);
    };
  }, []);
}
