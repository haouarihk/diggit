import Link from "next/link";
import { CodeDiff } from "@/components/CodeDiff";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { SyncForkButton } from "@/components/SyncForkButton";
import { compareUpstream, getRepository, listPullRequests, type RepositoryCommit } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function CompareUpstreamPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, compare] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    compareUpstream(decodedOwner, decodedName),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <section className="grid gap-3 border-b dark:border-gray-700/50 border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Compare with upstream</h2>
              <p className="text-[#59636e]">
                {compare.source ? (
                  <>
                    Original repository:{" "}
                    <Link className="font-semibold text-[#0969da] hover:underline" href={compare.source.url}>
                      {compare.source.owner_handle}/{compare.source.name}
                    </Link>
                  </>
                ) : (
                  "Original repository unavailable."
                )}
              </p>
            </div>
            {compare.behind_by > 0 ? <SyncForkButton name={decodedName} owner={decodedOwner} /> : null}
          </div>
          {compare.status === "unavailable" ? (
            <p className="text-[#59636e]">{compare.message ?? "Upstream comparison is unavailable."}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
              <span>{compare.ahead_by} commits ahead</span>
              <span>{compare.behind_by} commits behind</span>
              <span className="rounded-full border border-[#d0d7de] px-2 py-0.5">{compare.status.replaceAll("_", " ")}</span>
            </div>
          )}
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <CommitList commits={compare.ahead_commits} emptyLabel="No commits ahead of upstream." title="Ahead commits" />
          <CommitList commits={compare.behind_commits} emptyLabel="No upstream commits to sync." title="Behind commits" />
        </div>
        <CodeDiff emptyLabel="No diff to show between this fork and upstream." files={compare.files} />
      </RepoPageContent>
    </div>
  );
}

function CommitList({ commits, emptyLabel, title }: { commits: RepositoryCommit[]; emptyLabel: string; title: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
      <header className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
      </header>
      {commits.length === 0 ? (
        <p className="p-4 text-sm text-[#59636e]">{emptyLabel}</p>
      ) : (
        commits.map((commit) => (
          <article className="grid gap-1 border-b border-[#d8dee4] p-4 last:border-b-0" key={commit.sha}>
            <div className="font-semibold">{commit.message}</div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
              <span>{commit.author_name}</span>
              <span>{formatDate(commit.created_at)}</span>
              <span className="font-mono text-xs">{commit.sha.slice(0, 12)}</span>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
