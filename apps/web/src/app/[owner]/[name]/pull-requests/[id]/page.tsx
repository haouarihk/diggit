import { PullRequestDetailPanel } from "@/components/PullRequestDetailPanel";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { getPullRequest, getRepository, listPullRequestComments, listPullRequests, type PullRequestComment } from "@/lib/api";

type Props = {
  params: Promise<{
    id: string;
    name: string;
    owner: string;
  }>;
};

export default async function PullRequestPage({ params }: Props) {
  const { id, name, owner } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedId = decodeURIComponent(id);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, pullRequest, comments] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getPullRequest(decodedOwner, decodedName, decodedId),
    listPullRequestComments(decodedOwner, decodedName, decodedId, 1, 100).catch(() => emptyComments()),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <PullRequestDetailPanel
        baseHref={baseHref}
        comments={comments.data}
        name={decodedName}
        owner={decodedOwner}
        pullRequest={pullRequest}
      />
    </div>
  );
}

function emptyComments() {
  return {
    data: [] as PullRequestComment[],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
}
