"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Organization } from "@/lib/api";
import { authHeaders } from "@/lib/auth-session";

const API_URL = apiBaseUrl();

export function OrganizationPanel() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadOrganizations() {
    setIsLoading(true);
    setMessage("");
    const response = await fetch(`${API_URL}/organizations`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      setOrganizations([]);
      setMessage("Sign in to view your organizations.");
      setIsLoading(false);
      return;
    }

    const body = (await response.json()) as { data: Organization[] };
    setOrganizations(body.data);
    setIsLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadOrganizations();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
        <div>
          <h2 className="font-semibold">Your organizations</h2>
          <p className="text-sm text-[#59636e]">Shared owner namespaces you can work with.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="cursor-pointer rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold hover:border-[#0969da] hover:text-[#0969da]"
            disabled={isLoading}
            type="button"
            onClick={() => void loadOrganizations()}
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
          <Link className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" href="/new/organization">
            New organization
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="p-6 text-[#59636e]">Loading organizations...</div>
      ) : organizations.length === 0 ? (
        <div className="grid gap-2 p-6 text-center">
          <h3 className="text-lg font-semibold">No organizations yet</h3>
          <p className="text-[#59636e]">{message || "Create an organization to share repositories under a team name."}</p>
          <Link className="mx-auto mt-2 rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" href="/new/organization">
            Create organization
          </Link>
        </div>
      ) : (
        <div className="grid">
          {organizations.map((organization) => (
            <article className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]" key={organization.id}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#ddf4ff] text-sm font-bold text-[#0969da]">
                  {organizationInitials(organization)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="truncate text-base font-semibold text-[#0969da] hover:underline" href={`/organizations/${encodeURIComponent(organization.name)}`}>
                    {organization.display_name || organization.name}
                    </Link>
                    <span className="rounded-full border border-[#d0d7de] px-2 py-0.5 text-xs font-semibold text-[#59636e]">
                      @{organization.name}
                    </span>
                  </div>
                  <p className="truncate text-sm text-[#59636e]">
                    {organization.description || "No description provided."}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
                <span className="text-[#59636e]">Created {formatDate(organization.created_at)}</span>
                <Link className="font-semibold text-[#0969da] hover:underline" href={`/organizations/${encodeURIComponent(organization.name)}`}>
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function organizationInitials(organization: Organization) {
  const label = organization.display_name || organization.name;
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || organization.name.slice(0, 2).toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function CreateOrganizationForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        name: form.get("name"),
        display_name: form.get("displayName"),
        description: form.get("description"),
      }),
    });

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    const organization = (await response.json()) as Organization;
    router.push(`/organizations/${encodeURIComponent(organization.name)}`);
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Create organization</h2>
      <label className="grid gap-1.5">
        Name
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="name" required />
      </label>
      <label className="grid gap-1.5">
        Display name
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="displayName" />
      </label>
      <label className="grid gap-1.5">
        Description
        <textarea className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="description" rows={3} />
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Create organization
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
      <p className="text-[#59636e]">Reserved names like auth, activity, servers, admin, repos, and organizations cannot be claimed.</p>
    </form>
  );
}
