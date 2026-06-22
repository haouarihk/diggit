import { PullRequestDetailPanel } from "@/components/PullRequestDetailPanel";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getPullRequest, getRepository, listPullRequestActivity, listPullRequests, type ActivityItem } from "@/lib/api";
import { publicApiBaseUrl } from "@/lib/runtime-config";
import type { Metadata } from "next";

type Props = {
  params: Promise<{
    id: string;
    name: string;
    owner: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, name, owner } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedId = decodeURIComponent(id);
  const pullRequest = await getPullRequest(decodedOwner, decodedName, decodedId);
  const title = `${pullRequest.title} · ${decodedOwner}/${decodedName}#${pullRequest.id}`;
  const description =
    pullRequest.body ||
    `${pullRequest.status} pull request from ${pullRequest.source_branch} into ${pullRequest.target_branch}.`;
  const image = `${publicApiBaseUrl()}/social/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/pull/${encodeURIComponent(String(pullRequest.id))}/preview.png`;

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

export default async function PullRequestPage({ params }: Props) {
  const { id, name, owner } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedId = decodeURIComponent(id);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, pullRequest, activity] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getPullRequest(decodedOwner, decodedName, decodedId),
    listPullRequestActivity(decodedOwner, decodedName, decodedId, 1, 100).catch(() => emptyActivity()),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <PullRequestDetailPanel
          baseHref={baseHref}
          activity={activity.data}
          name={decodedName}
          owner={decodedOwner}
          pullRequest={pullRequest}
        />
      </RepoPageContent>
    </div>
  );
}

function emptyActivity() {
  return {
    data: [] as ActivityItem[],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
}
