import { IssueDetailPanel } from "@/components/IssueDetailPanel";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import {
  getRepository,
  getRepositoryIssue,
  listRepositoryIssueActivity,
  listPullRequests,
  listRepositoryIssues,
  type ActivityItem,
  type Issue,
} from "@/lib/api";
import { publicApiBaseUrl } from "@/lib/runtime-config";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ owner: string; name: string; number: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, name, number } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const issueNumber = Number.parseInt(number, 10);
  const issue = await getRepositoryIssue(decodedOwner, decodedName, issueNumber);
  const title = `${issue.title} · ${decodedOwner}/${decodedName}#${issue.number}`;
  const description = issue.body || `${issue.status} issue opened by ${issue.author_handle}.`;
  const image = `${publicApiBaseUrl()}/social/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/issues/${issue.number}/preview.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${title} social preview` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function RepositoryIssuePage({ params }: Props) {
  const { owner, name, number } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const issueNumber = Number.parseInt(number, 10);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, issueCount, issue, activity] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listRepositoryIssues(decodedOwner, decodedName, { page: 1, limit: 1, status: "open" }).catch(() => emptyIssues()),
    getRepositoryIssue(decodedOwner, decodedName, issueNumber),
    listRepositoryIssueActivity(decodedOwner, decodedName, issueNumber, 1, 100).catch(() => emptyActivity()),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader
        activeTab="issues"
        issuesCount={issueCount.pagination.total}
        pullRequestsCount={pullRequests.data.length}
        repo={repo}
      />
      <RepoPageContent>
        <IssueDetailPanel
          baseHref={baseHref}
          activity={activity.data}
          issue={issue}
          name={decodedName}
          owner={decodedOwner}
        />
      </RepoPageContent>
    </div>
  );
}

function emptyIssues() {
  return {
    data: [] as Issue[],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
  };
}

function emptyActivity() {
  return {
    data: [] as ActivityItem[],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
}
