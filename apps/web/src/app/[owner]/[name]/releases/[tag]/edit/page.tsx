import { ReleaseEditPanel } from "@/components/RepositoryReleasesPanel";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRelease, getRepository, listPullRequests, listReleases } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
    tag: string;
  }>;
};

export default async function EditRepositoryReleasePage({ params }: Props) {
  const { owner, name, tag } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedTag = decodeURIComponent(tag);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests, release, releaseCount] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })),
    getRelease(decodedOwner, decodedName, decodedTag),
    listReleases(decodedOwner, decodedName, { page: 1, limit: 1, status: "published" }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="releases" pullRequestsCount={pullRequests.pagination?.total ?? pullRequests.data.length} releasesCount={releaseCount.pagination.total} repo={repo} />

      <RepoPageContent>
        <ReleaseEditPanel baseHref={baseHref} name={decodedName} owner={decodedOwner} release={release} />
      </RepoPageContent>
    </div>
  );
}
