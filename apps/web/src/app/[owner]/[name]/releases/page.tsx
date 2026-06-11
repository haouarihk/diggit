import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { RepositoryReleasesPanel } from "@/components/RepositoryReleasesPanel";
import { getRepository, listPullRequests, listReleases, listRepositoryTags, type Release } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
};

export default async function RepositoryReleasesPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { page, status: rawStatus } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const status = releaseStatus(rawStatus);
  const selectedPage = Number.parseInt(page ?? "1", 10) || 1;
  const [repo, pullRequests, releases, releaseCount, tags] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listReleases(decodedOwner, decodedName, { page: selectedPage, limit: 25, status }).catch(() => emptyReleases(selectedPage)),
    listReleases(decodedOwner, decodedName, { page: 1, limit: 1, status: "published" }).catch(() => emptyReleases(1)),
    listRepositoryTags(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="releases" pullRequestsCount={pullRequests.data.length} releasesCount={releaseCount.pagination.total} repo={repo} />

      <RepoPageContent>
        <RepositoryReleasesPanel
          baseHref={baseHref}
          name={decodedName}
          owner={decodedOwner}
          pagination={releases.pagination}
          releases={releases.data}
          status={status}
          tags={tags.data}
        />
      </RepoPageContent>
    </div>
  );
}

function releaseStatus(value?: string): "published" | "draft" | "all" {
  return value === "draft" || value === "all" ? value : "published";
}

function emptyReleases(page: number) {
  return {
    data: [] as Release[],
    pagination: {
      page,
      limit: 25,
      total: 0,
      totalPages: 0,
    },
  };
}
