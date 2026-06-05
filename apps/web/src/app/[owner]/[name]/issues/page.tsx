import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { RepositoryIssuesPanel } from "@/components/RepositoryIssuesPanel";
import { getRepository, listIssueLabels, listPullRequests, listRepositoryIssues, type Issue } from "@/lib/api";

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
  const status = issueStatus(rawStatus);
  const selectedPage = Number.parseInt(page ?? "1", 10) || 1;
  const [repo, pullRequests, issues, issueCount, issueLabels] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listRepositoryIssues(decodedOwner, decodedName, { labels, page: selectedPage, limit: 25, q, status }).catch(
      () => emptyIssues(selectedPage),
    ),
    listRepositoryIssues(decodedOwner, decodedName, { page: 1, limit: 1, status: "open" }).catch(() => emptyIssues(1)),
    listIssueLabels(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader
        activeTab="issues"
        issuesCount={issueCount.pagination.total}
        pullRequestsCount={pullRequests.data.length}
        repo={repo}
      />

      <RepositoryIssuesPanel
        baseHref={baseHref}
        issues={issues.data}
        labels={issueLabels.data}
        name={decodedName}
        owner={decodedOwner}
        pagination={issues.pagination}
        query={q ?? ""}
        selectedLabels={labels ?? ""}
        status={status}
      />
    </div>
  );
}

function issueStatus(value?: string): "open" | "closed" | "all" {
  return value === "closed" || value === "all" ? value : "open";
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
