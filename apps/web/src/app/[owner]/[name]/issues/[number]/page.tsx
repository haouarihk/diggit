import { IssueDetailPanel } from "@/components/IssueDetailPanel";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import {
  getRepository,
  getRepositoryIssue,
  listPullRequests,
  listRepositoryIssueComments,
  listRepositoryIssues,
  type Issue,
  type IssueComment,
} from "@/lib/api";

type Props = {
  params: Promise<{ owner: string; name: string; number: string }>;
};

export default async function RepositoryIssuePage({ params }: Props) {
  const { owner, name, number } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const issueNumber = Number.parseInt(number, 10);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, issueCount, issue, comments] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listRepositoryIssues(decodedOwner, decodedName, { page: 1, limit: 1, status: "open" }).catch(() => emptyIssues()),
    getRepositoryIssue(decodedOwner, decodedName, issueNumber),
    listRepositoryIssueComments(decodedOwner, decodedName, issueNumber, 1, 100).catch(() => emptyComments()),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader
        activeTab="issues"
        issuesCount={issueCount.pagination.total}
        pullRequestsCount={pullRequests.data.length}
        repo={repo}
      />
      <IssueDetailPanel
        baseHref={baseHref}
        comments={comments.data}
        issue={issue}
        name={decodedName}
        owner={decodedOwner}
      />
    </div>
  );
}

function emptyIssues() {
  return {
    data: [] as Issue[],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
  };
}

function emptyComments() {
  return {
    data: [] as IssueComment[],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
}
