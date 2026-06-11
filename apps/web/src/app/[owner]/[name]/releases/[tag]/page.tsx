import { ReleaseCreatePanel, ReleaseDetailPanel } from "@/components/RepositoryReleasesPanel";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRelease, getRepository, listPullRequests, listReleases, listRepositoryBranches, listRepositoryTags } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
    tag: string;
  }>;
};

export default async function RepositoryReleaseDetailPage({ params }: Props) {
  const { owner, name, tag } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedTag = decodeURIComponent(tag);
  const baseHref = repoHref(decodedOwner, decodedName);
  if (decodedTag === "new") {
    const [repo, pullRequests, releaseCount, tags, branches] = await Promise.all([
      getRepository(decodedOwner, decodedName),
      listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
      listReleases(decodedOwner, decodedName, { page: 1, limit: 1, status: "published" }).catch(() => ({
        data: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      })),
      listRepositoryTags(decodedOwner, decodedName).catch(() => ({ data: [] })),
      listRepositoryBranches(decodedOwner, decodedName).catch(() => ({ data: [] })),
    ]);

    return (
      <div className="grid gap-6">
        <RepoHeader activeTab="releases" pullRequestsCount={pullRequests.data.length} releasesCount={releaseCount.pagination.total} repo={repo} />

        <RepoPageContent>
          <ReleaseCreatePanel baseHref={baseHref} branches={branches.data} name={decodedName} owner={decodedOwner} tags={tags.data} />
        </RepoPageContent>
      </div>
    );
  }

  const [repo, pullRequests, release, releaseCount, tags] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getRelease(decodedOwner, decodedName, decodedTag),
    listReleases(decodedOwner, decodedName, { page: 1, limit: 1, status: "published" }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listRepositoryTags(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="releases" pullRequestsCount={pullRequests.data.length} releasesCount={releaseCount.pagination.total} repo={repo} />

      <RepoPageContent>
        <ReleaseDetailPanel baseHref={baseHref} name={decodedName} owner={decodedOwner} release={release} tags={tags.data} />
      </RepoPageContent>
    </div>
  );
}
