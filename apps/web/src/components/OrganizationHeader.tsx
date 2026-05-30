"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Organization } from "@/lib/api";
import { organizationHref } from "@/lib/routes";

type OrganizationHeaderProps = {
  organization: Organization;
};

type OrganizationTab = {
  href: string;
  label: string;
  value: "overview" | "repositories" | "settings";
};

export function OrganizationHeader({ organization }: OrganizationHeaderProps) {
  const pathname = usePathname();
  const baseHref = organizationHref(organization.name);
  const fallback = organizationInitials(organization);
  const tabs: OrganizationTab[] = [
    { href: baseHref, label: "Overview", value: "overview" },
    { href: `${baseHref}/repositories`, label: "Repositories", value: "repositories" },
    { href: `${baseHref}/settings`, label: "Settings", value: "settings" },
  ];

  return (
    <section className="-mx-6 border-b border-[#d0d7de] bg-white px-6 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#d0d7de] bg-[#ddf4ff] text-xl font-bold text-[#0969da]">
            {fallback}
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold">{organization.display_name}</h1>
            <p className="text-[#59636e]">@{organization.name}</p>
          </div>
        </div>
      </div>

      <nav aria-label="Organization" className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <OrganizationTabLink active={activeTab(pathname, baseHref) === tab.value} href={tab.href} key={tab.value} label={tab.label} />
        ))}
      </nav>
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

function activeTab(pathname: string, baseHref: string): OrganizationTab["value"] {
  if (pathname.startsWith(`${baseHref}/repositories`)) {
    return "repositories";
  }
  if (pathname.startsWith(`${baseHref}/settings`)) {
    return "settings";
  }
  return "overview";
}

function OrganizationTabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      className={`flex shrink-0 items-center border-b-2 px-3 py-3 font-semibold ${
        active
          ? "border-[#fd8c73] text-[#1f2328]"
          : "border-transparent text-[#59636e] hover:border-[#d0d7de] hover:text-[#1f2328]"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}
