"use client";

import Link from "next/link";
import { Archive, CircleDot, Code2, GitPullRequest, Play, Settings, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export type RepoActiveTab = "actions" | "code" | "issues" | "pull-requests" | "releases" | "settings";

type RepoTabsProps = {
  activeTab: RepoActiveTab;
  baseHref: string;
  issuesCount: number;
  issuesEnabled: boolean;
  pullRequestsCount: number;
  pullRequestsEnabled: boolean;
  releasesCount: number;
};

type RepoTabItem = {
  active: boolean;
  count?: number;
  href: string;
  icon: LucideIcon;
  label: string;
};

export function RepoTabs({
  activeTab,
  baseHref,
  issuesCount,
  issuesEnabled,
  pullRequestsCount,
  pullRequestsEnabled,
  releasesCount,
}: RepoTabsProps) {
  const tabs: RepoTabItem[] = [
    { active: activeTab === "code", href: baseHref, icon: Code2, label: "Code" },
    ...(issuesEnabled
      ? [
          {
            active: activeTab === "issues",
            count: issuesCount,
            href: `${baseHref}/issues`,
            icon: CircleDot,
            label: "Issues",
          },
        ]
      : []),
    ...(pullRequestsEnabled
      ? [
          {
            active: activeTab === "pull-requests",
            count: pullRequestsCount,
            href: `${baseHref}/pull-requests`,
            icon: GitPullRequest,
            label: "Pull requests",
          },
        ]
      : []),
    {
      active: activeTab === "releases",
      count: releasesCount,
      href: `${baseHref}/releases`,
      icon: Archive,
      label: "Releases",
    },
    { active: activeTab === "actions", href: `${baseHref}/actions`, icon: Play, label: "Actions" },
    { active: activeTab === "settings", href: `${baseHref}/settings`, icon: Settings, label: "Settings" },
  ];

  return (
    <nav aria-label="Repository" className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <RepoTab key={tab.href} {...tab} />
      ))}
    </nav>
  );
}

function RepoTab({ active, count, href, icon: Icon, label }: RepoTabItem) {
  return (
    <Link
      className={`group relative flex shrink-0 items-center gap-2 overflow-hidden rounded-t-md px-3 py-3 font-semibold outline-none transition-colors ${
        active ? "text-[#1f2328]" : "text-[#59636e] hover:text-[#1f2328]"
      }`}
      href={href}
    >
      <motion.span
        className="absolute inset-x-1 bottom-1 top-1 rounded-md bg-[#f6f8fa] opacity-0 group-hover:opacity-100"
        initial={false}
        transition={{ duration: 0.16, ease: "easeOut" }}
      />
      <motion.span
        className="relative flex items-center gap-2"
        transition={{ type: "spring", stiffness: 520, damping: 32 }}
        whileHover={{ y: -1 }}
      >
        <Icon aria-hidden="true" className="h-4 w-4 text-current" />
        <span>{label}</span>
        {typeof count === "number" ? (
          <span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-xs text-[#1f2328]">{count}</span>
        ) : null}
      </motion.span>
      {active ? (
        <motion.span
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#0969da]"
          layoutId="repo-tab-active-underline"
          transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.8 }}
        />
      ) : null}
    </Link>
  );
}
