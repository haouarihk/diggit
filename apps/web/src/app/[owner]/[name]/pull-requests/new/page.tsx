import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { PullRequestSourceStep } from "@/components/PullRequestFlow";
import { getPullRequestOptions, getRepository, listPullRequests } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function NewPullRequestPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, options] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })),
    getPullRequestOptions(decodedOwner, decodedName),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequests.pagination?.total ?? pullRequests.data.length} repo={repo} />

      <RepoPageContent>
        <section className="grid gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">New pull request</h2>
            <p className="text-[#59636e]">Compare a source repository and branch with this repository.</p>
          </div>
          <PullRequestSourceStep baseHref={baseHref} options={options} />
        </section>
      </RepoPageContent>
    </div>
  );
}
