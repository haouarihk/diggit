import Link from "next/link";
import { ForkButton } from "@/components/ForkButton";
import { CurrentUserNavActions } from "@/components/NavActions";
import { RepoTabs, type RepoActiveTab } from "@/components/RepoTabs";
import { StarButton } from "@/components/StarButton";
import type { Repository } from "@/lib/api";
import type { ReactNode } from "react";

type RepoHeaderProps = {
  activeTab: RepoActiveTab;
  issuesCount?: number;
  pullRequestsCount?: number;
  releasesCount?: number;
  repo: Repository;
};

export function RepoHeader({ activeTab, issuesCount = 0, pullRequestsCount = 0, releasesCount = 0, repo }: RepoHeaderProps) {
  const ownerProfile = repoOwnerProfile(repo);
  const baseHref = repoHref(repo.owner_handle, repo.name);

  return (
    <section className="-mx-6 border-b border-[#d0d7de] bg-white px-6 pt-3">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 pb-3">
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
          {/* <p className="mt-2 text-[#59636e]">
            {repo.remote_server ? `Mirrored from ${repo.remote_server}` : "Local repository"}
          </p> */}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <ForkButton initialForks={repo.forks_count ?? 0} name={repo.name} owner={repo.owner_handle} />
            <StarButton
              initialStarred={repo.viewer_has_starred}
              initialStars={repo.stars_count}
              name={repo.name}
              owner={repo.owner_handle}
            />
          </div>
          <CurrentUserNavActions className="shrink-0" />
        </div>
      </div>

      <RepoTabs
        activeTab={activeTab}
        baseHref={baseHref}
        issuesCount={issuesCount}
        issuesEnabled={repo.issues_enabled}
        pullRequestsCount={pullRequestsCount}
        pullRequestsEnabled={repo.pull_requests_enabled}
        releasesCount={releasesCount}
      />
    </section>
  );
}

export function RepoPageContent({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid w-full max-w-7xl gap-6">{children}</div>;
}

export function repoHref(owner: string, name: string) {
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function repoOwnerProfile(repo: Repository) {
  const handle = repo.owner?.handle ?? repo.owner_handle;
  const kind = repo.owner?.kind === "organization" ? "organizations" : "users";

  return {
    handle,
    href: `/${kind}/${encodeURIComponent(handle)}`,
  };
}
