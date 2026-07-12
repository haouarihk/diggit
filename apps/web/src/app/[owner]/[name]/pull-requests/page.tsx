import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { RepositoryPullRequestsPanel } from "@/components/RepositoryPullRequestsPanel";
import { getRepository, listIssueLabels, listPullRequests, type PullRequest } from "@/lib/api";
import { getPullRequestSearchInput, parsePullRequestSearchQuery } from "@/lib/repo-list-query";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
  }>;
};

export default async function RepositoryPullRequestsPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { page, q } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const query = getPullRequestSearchInput(q);
  const parsedQuery = parsePullRequestSearchQuery(query);
  const selectedPage = Number.parseInt(page ?? "1", 10) || 1;
  const repo = await getRepository(decodedOwner, decodedName);
  const [pullRequestCount, pullRequests, labels] = await Promise.all([
    listPullRequests(decodedOwner, decodedName).catch(() => emptyPullRequests(1)),
    listPullRequests(decodedOwner, decodedName, {
      labels: parsedQuery.labels.join(",") || undefined,
      limit: 25,
      page: selectedPage,
      q: parsedQuery.searchText || undefined,
      status: parsedQuery.status ?? "all",
    }).catch(() => emptyPullRequests(selectedPage)),
    listIssueLabels(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequestCount.pagination.total} repo={repo} />

      <RepoPageContent>
        <RepositoryPullRequestsPanel baseHref={baseHref} labels={labels.data} pagination={pullRequests.pagination} pullRequests={pullRequests.data} query={query} />
      </RepoPageContent>
    </div>
  );
}

function emptyPullRequests(page: number) {
  return {
    data: [] as PullRequest[],
    pagination: {
      page,
      limit: 25,
      total: 0,
      totalPages: 0,
    },
  };
}
