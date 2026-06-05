import Link from "next/link";
import { CodeDiff } from "@/components/CodeDiff";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { getCommit, getRepository, listPullRequests } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
    sha: string;
  }>;
  searchParams: Promise<{ path?: string }>;
};

export default async function CommitDetailPage({ params, searchParams }: Props) {
  const { owner, name, sha } = await params;
  const { path } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedSha = decodeURIComponent(sha);
  const focusPath = path ? decodeURIComponent(path) : undefined;
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, detail] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getCommit(decodedOwner, decodedName, decodedSha),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
        <Link className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/commits`}>
          Back to commits
        </Link>
        <h2 className="text-xl font-semibold">{detail.commit.message}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
          <span>{detail.commit.author_name}</span>
          <span>{formatDate(detail.commit.created_at)}</span>
          <span className="font-mono text-xs">{detail.commit.sha}</span>
        </div>
        {detail.parents.length > 0 ? (
          <p className="text-sm text-[#59636e]">Parent {detail.parents.map((parent) => parent.slice(0, 12)).join(", ")}</p>
        ) : null}
      </section>
      <CodeDiff files={detail.files} focusPath={focusPath} />
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
