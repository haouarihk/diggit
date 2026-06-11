import { ReleaseCreatePanel } from "@/components/RepositoryReleasesPanel";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRepository, listPullRequests, listReleases, listRepositoryBranches, listRepositoryTags } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function NewRepositoryReleasePage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
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
