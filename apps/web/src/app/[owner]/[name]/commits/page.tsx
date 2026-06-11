import Link from "next/link";
import { BookOpen, GitCommit, History } from "lucide-react";
import { CopyShaButton } from "@/components/CopyShaButton";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRepository, listCommits, listPullRequests, type RepositoryCommit } from "@/lib/api";

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
  const repo = await getRepository(decodedOwner, decodedName);
  const selectedBranch = branch || repo.default_branch;
  const [pullRequests, commits] = await Promise.all([
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listCommits(decodedOwner, decodedName, selectedBranch, 0).catch(() => ({ data: [] })),
  ]);
  const commitGroups = groupCommitsByDay(commits.data);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
            <div>
              <h2 className="font-semibold">Commit history for {selectedBranch}</h2>
              <p className="text-sm text-[#59636e]">{commits.data.length} commits grouped by date</p>
            </div>
            <History className="h-5 w-5 text-[#59636e]" aria-hidden="true" />
          </header>
          {commits.data.length === 0 ? (
            <p className="p-4 text-[#59636e]">No commits found.</p>
          ) : (
            <div className="grid">
              {commitGroups.map((group) => (
                <section className="border-b border-[#d8dee4] last:border-b-0" key={group.key}>
                  <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-sm font-semibold text-[#59636e]">
                    {group.label}
                  </div>
                  {group.commits.map((commit) => (
                    <article className="flex flex-col gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 md:flex-row md:items-center md:justify-between" key={commit.sha}>
                      <div className="min-w-0">
                        <Link className="font-semibold text-[#0969da] hover:underline" href={`${baseHref}/commits/${commit.sha}`}>
                          {commit.message}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#59636e]">
                          <CommitAuthor commit={commit} />
                          <span aria-hidden="true">&middot;</span>
                          <span>{formatTime(commit.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1 font-mono text-xs text-[#59636e]" title={commit.sha}>
                          <GitCommit className="h-3.5 w-3.5" aria-hidden="true" />
                          {commit.sha.slice(0, 12)}
                        </span>
                        <CopyShaButton sha={commit.sha} />
                        <Link
                          aria-label="Browse repository at this commit"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d0d7de] bg-white text-[#59636e] hover:border-[#0969da] hover:text-[#0969da]"
                          href={`${baseHref}?ref=${encodeURIComponent(commit.sha)}`}
                          title="Browse repository at this commit"
                        >
                          <BookOpen className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </section>
      </RepoPageContent>
    </div>
  );
}

function CommitAuthor({ commit }: { commit: RepositoryCommit }) {
  const avatar = commit.author_avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className="h-6 w-6 rounded-full bg-[#d0d7de]" src={commit.author_avatar_url} />
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d0d7de] text-[10px] font-bold">
      {commit.avatar_fallback}
    </span>
  );
  const label = <span className="font-medium text-[#1f2328]">{commit.author_name}</span>;

  if (commit.author_username) {
    return (
      <Link className="inline-flex min-w-0 items-center gap-2 hover:text-[#0969da]" href={`/users/${encodeURIComponent(commit.author_username)}`}>
        {avatar}
        {label}
      </Link>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {avatar}
      {label}
    </span>
  );
}

function groupCommitsByDay(commits: RepositoryCommit[]) {
  const groups = new Map<string, { key: string; label: string; commits: RepositoryCommit[] }>();

  for (const commit of commits) {
    const date = new Date(commit.created_at);
    const key = Number.isNaN(date.getTime()) ? commit.created_at : date.toISOString().slice(0, 10);
    const label = Number.isNaN(date.getTime())
      ? commit.created_at
      : new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(date);
    const group = groups.get(key) ?? { key, label, commits: [] };
    group.commits.push(commit);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(date);
}
