import Link from "next/link";
import { ForkButton } from "@/components/ForkButton";
import { StarButton } from "@/components/StarButton";
import type { Repository } from "@/lib/api";

type RepoHeaderProps = {
  activeTab: "actions" | "code" | "issues" | "pull-requests" | "settings";
  issuesCount?: number;
  pullRequestsCount?: number;
  repo: Repository;
};

export function RepoHeader({ activeTab, issuesCount = 0, pullRequestsCount = 0, repo }: RepoHeaderProps) {
  const ownerProfile = repoOwnerProfile(repo);
  const baseHref = repoHref(repo.owner_handle, repo.name);

  return (
    <section className="-mx-6 border-b border-[#d0d7de] bg-white px-6 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xl">
            <Link className="font-semibold text-[#0969da] hover:underline" href={ownerProfile.href}>
              {ownerProfile.handle}
            </Link>
            <span className="text-[#59636e]">/</span>
            <Link className="min-w-0 break-all text-xl font-semibold text-[#0969da] hover:underline" href={baseHref}>
              {repo.name}
            </Link>
            <span className="rounded-full border border-[#d0d7de] px-2 py-0.5 text-xs font-semibold text-[#59636e]">
              {repo.visibility}
            </span>
          </div>
          <p className="mt-2 text-[#59636e]">
            {repo.remote_server ? `Mirrored from ${repo.remote_server}` : "Local repository"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ForkButton initialForks={repo.forks_count ?? 0} name={repo.name} owner={repo.owner_handle} />
          <StarButton
            initialStarred={repo.viewer_has_starred}
            initialStars={repo.stars_count}
            name={repo.name}
            owner={repo.owner_handle}
          />
        </div>
      </div>

      <nav aria-label="Repository" className="flex gap-1 overflow-x-auto">
        <RepoTab active={activeTab === "code"} href={baseHref} label="Code" />
        {repo.issues_enabled ? <RepoTab active={activeTab === "issues"} href={`${baseHref}/issues`} label="Issues" count={issuesCount} /> : null}
        {repo.pull_requests_enabled ? (
          <RepoTab
            active={activeTab === "pull-requests"}
            href={`${baseHref}/pull-requests`}
            label="Pull requests"
            count={pullRequestsCount}
          />
        ) : null}
        <RepoTab active={activeTab === "actions"} href={`${baseHref}/actions`} label="Actions" />
        <RepoTab active={activeTab === "settings"} href={`${baseHref}/settings`} label="Settings" />
      </nav>
    </section>
  );
}

export function repoHref(owner: string, name: string) {
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function RepoTab({
  active = false,
  count,
  href,
  label,
}: {
  active?: boolean;
  count?: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 font-semibold ${
        active
          ? "border-[#fd8c73] text-[#1f2328]"
          : "border-transparent text-[#59636e] hover:border-[#d0d7de] hover:text-[#1f2328]"
      }`}
      href={href}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-xs text-[#1f2328]">{count}</span>
      ) : null}
    </Link>
  );
}

function repoOwnerProfile(repo: Repository) {
  const handle = repo.owner?.handle ?? repo.owner_handle;
  const kind = repo.owner?.kind === "organization" ? "organizations" : "users";

  return {
    handle,
    href: `/${kind}/${encodeURIComponent(handle)}`,
  };
}
