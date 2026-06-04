import Link from "next/link";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { apiFetch, listCommits, type PullRequest, type Repository } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
  searchParams: Promise<{
    branch?: string;
  }>;
};

export default async function CommitsPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { branch } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const repo = await apiFetch<Repository>(baseHref);
  const selectedBranch = branch || repo.default_branch;
  const [pullRequests, commits] = await Promise.all([
    apiFetch<{ data: PullRequest[] }>(`${baseHref}/pull-requests`).catch(() => ({ data: [] })),
    listCommits(decodedOwner, decodedName, selectedBranch).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
        <header className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
          <h2 className="font-semibold">Commit history for {selectedBranch}</h2>
        </header>
        {commits.data.length === 0 ? (
          <p className="p-4 text-[#59636e]">No commits found.</p>
        ) : (
          commits.data.map((commit) => (
            <article className="grid gap-1 border-b border-[#d8dee4] p-4 last:border-b-0" key={commit.sha}>
              <Link className="font-semibold text-[#0969da] hover:underline" href={`${baseHref}/commits/${commit.sha}`}>
                {commit.message}
              </Link>
              <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
                <span>{commit.author_name}</span>
                <span>{formatDate(commit.created_at)}</span>
                <span className="font-mono text-xs">{commit.sha.slice(0, 12)}</span>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
