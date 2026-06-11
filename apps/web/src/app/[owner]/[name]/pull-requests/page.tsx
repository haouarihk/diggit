import Link from "next/link";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRepository, listPullRequests } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function RepositoryPullRequestsPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const repo = await getRepository(decodedOwner, decodedName);
  const pullRequests = await listPullRequests(decodedOwner, decodedName).catch(() => ({
    data: [],
  }));

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <RepoPageContent>
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Pull requests</h2>
              <p className="text-sm text-[#59636e]">Review proposed branch changes for this repository.</p>
            </div>
            <Link
              className="inline-flex rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]"
              href={`${baseHref}/pull-requests/new`}
            >
              New pull request
            </Link>
          </div>

          {pullRequests.data.length === 0 ? (
            <div className="grid gap-2 p-6 text-center">
              <h3 className="text-lg font-semibold">No pull requests yet</h3>
              <p className="text-[#59636e]">Open a pull request to propose changes from another branch or repository.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-12 p-4">
              {pullRequests.data.map((pullRequest) => (
                <article className="grid gap-3 border-2 border-black/10 p-4 dark:border-white/10" key={pullRequest.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="font-semibold text-[#0969da] hover:underline"
                      href={`${baseHref}/pull/${encodeURIComponent(String(pullRequest.id))}`}
                    >
                      {pullRequest.title}
                    </Link>
                    <span className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 text-xs font-semibold text-[#59636e]">
                      {pullRequest.status}
                    </span>
                  </div>
                  <p className="text-[#59636e]">
                    {pullRequest.author_handle} wants to merge {pullRequest.source_branch} into{" "}
                    {pullRequest.target_branch}
                  </p>
                  {pullRequest.body ? <p>{pullRequest.body}</p> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </RepoPageContent>
    </div>
  );
}
