"use client";

import Link from "next/link";
import { useCurrentUser } from "@/components/useCurrentUser";

export default function UserSettingsPage() {
  const { status, user } = useCurrentUser();

  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          Account settings
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">General settings</h1>
        <p className="text-[#59636e]">Review your account details and manage personal Git access settings.</p>
      </section>

      {user ? (
        <section className="rounded-md border border-[#d0d7de] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="h-16 w-16 rounded-full bg-[#d0d7de]" src={user.avatar_url} />
              ) : (
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#d0d7de] text-xl font-bold text-[#24292f]">
                  {user.avatar_fallback}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="wrap-break-word text-2xl font-semibold">{user.display_name}</h2>
                <p className="text-[#59636e]">@{user.username}</p>
                {user.home_server ? <p className="truncate text-[#59636e]">{user.home_server}</p> : null}
              </div>
            </div>
            <Link
              className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 font-semibold text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]"
              href={`/users/${encodeURIComponent(user.username)}`}
            >
              View profile
            </Link>
          </div>
        </section>
      ) : status === "loading" ? (
        <section className="rounded-md border border-[#d0d7de] bg-white p-4">
          <div className="h-7 w-56 rounded bg-[#f6f8fa]" />
          <div className="mt-3 h-4 w-40 rounded bg-[#f6f8fa]" />
        </section>
      ) : (
        <section className="rounded-md border border-[#d0d7de] bg-white p-4">
          <h2 className="text-lg font-semibold">Sign in required</h2>
          <p className="mt-1 text-[#59636e]">Sign in to view and manage your account settings.</p>
          <Link
            className="mt-4 inline-flex rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]"
            href="/auth"
          >
            Sign in
          </Link>
        </section>
      )}
    </div>
  );
}
