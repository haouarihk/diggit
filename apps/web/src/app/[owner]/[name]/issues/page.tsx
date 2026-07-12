import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { RepositoryIssuesPanel } from "@/components/RepositoryIssuesPanel";
import { getRepository, listIssueLabels, listPullRequests, listRepositoryIssues, type Issue } from "@/lib/api";
import { getIssueSearchInput, parseIssueSearchQuery } from "@/lib/repo-list-query";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    labels?: string;
    status?: string;
  }>;
};

export default async function RepositoryIssuesPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { labels, page, q, status: rawStatus } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const searchQuery = getIssueSearchInput(q, { labels, status: rawStatus });
  const parsedQuery = parseIssueSearchQuery(searchQuery);
  const selectedPage = Number.parseInt(page ?? "1", 10) || 1;
  const [repo, pullRequests, issues, issueCount, issueLabels] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })),
    listRepositoryIssues(decodedOwner, decodedName, {
      labels: parsedQuery.labels.join(",") || undefined,
      page: selectedPage,
      limit: 25,
      q: parsedQuery.searchText || undefined,
      status: parsedQuery.status ?? "all",
    }).catch(() => emptyIssues(selectedPage)),
    listRepositoryIssues(decodedOwner, decodedName, { page: 1, limit: 1, status: "open" }).catch(() => emptyIssues(1)),
    listIssueLabels(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader
        activeTab="issues"
        issuesCount={issueCount.pagination.total}
        pullRequestsCount={pullRequests.pagination?.total ?? pullRequests.data.length}
        repo={repo}
      />

      <RepoPageContent>
        <RepositoryIssuesPanel
          baseHref={baseHref}
          issues={issues.data}
          labels={issueLabels.data}
          name={decodedName}
          owner={decodedOwner}
          pagination={issues.pagination}
          query={searchQuery}
        />
      </RepoPageContent>
    </div>
  );
}

function emptyIssues(page: number) {
  return {
    data: [] as Issue[],
    pagination: {
      page,
      limit: 25,
      total: 0,
      totalPages: 0,
    },
  };
}
