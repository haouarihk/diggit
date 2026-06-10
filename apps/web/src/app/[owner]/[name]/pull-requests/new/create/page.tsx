import { PullRequestCreateForm } from "@/components/PullRequestFlow";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { comparePullRequestBranches, getRepository, listPullRequests, type RepositoryCompare } from "@/lib/api";
import { decodePullRequestSource } from "@/lib/pull-request-flow";
import Link from "next/link";

type Props = {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<{
    from?: string;
    targetBranch?: string;
  }>;
};

export default async function CreatePullRequestPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { from, targetBranch } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);
  const selection = decodePullRequestSource(from);
  const compare =
    selection && targetBranch
      ? await comparePullRequestBranches(decodedOwner, decodedName, {
          source_branch: selection.branch,
          source_repo_url: selection.url,
          source_repository_id: selection.repositoryId,
          target_branch: targetBranch,
        }).catch(() => null)
      : null;
  const defaultTitle = selection && targetBranch ? defaultPullRequestTitle(selection.branch, targetBranch, compare) : "";

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <section className="grid gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">New pull request</h2>
          <p className="text-[#59636e]">Add the final details and create the pull request.</p>
        </div>

        {selection && targetBranch ? (
          <PullRequestCreateForm
            baseHref={baseHref}
            defaultTitle={defaultTitle}
            name={decodedName}
            owner={decodedOwner}
            selection={selection}
            targetBranch={targetBranch}
          />
        ) : (
          <div className="grid gap-3 rounded-2xl border border-[#d0d7de] bg-white p-6 text-center">
            <h3 className="text-lg font-semibold">Choose branches first</h3>
            <p className="text-[#59636e]">A source and target branch are required before creating a pull request.</p>
            <Link className="justify-self-center rounded-lg border border-[#d0d7de] bg-white px-4 py-2 font-semibold" href={`${baseHref}/pull-requests/new`}>
              Start over
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function defaultPullRequestTitle(sourceBranch: string, targetBranch: string, compare: RepositoryCompare | null) {
  if (compare?.ahead_commits.length === 1) {
    return firstLine(compare.ahead_commits[0]?.message ?? "");
  }
  return `Merge from ${sourceBranch} to ${targetBranch}`;
}

function firstLine(value: string) {
  return value.split(/\r?\n/)[0]?.trim() || value.trim();
}
