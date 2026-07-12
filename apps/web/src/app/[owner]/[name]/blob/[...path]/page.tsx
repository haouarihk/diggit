import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { RepositoryCodeBrowser } from "@/components/RepositoryCodeBrowser";
import {
  getRepository,
  getRepositoryFile,
  getRepositoryTree,
  listPullRequests,
  listRepositoryBranches,
  listRepositoryTags,
  type RepositoryTree,
} from "@/lib/api";

type Props = {
  params: Promise<{ owner: string; name: string; path: string[] }>;
  searchParams: Promise<{ ref?: string }>;
};

export default async function RepositoryBlobPage({ params, searchParams }: Props) {
  const { owner, name, path } = await params;
  const { ref } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const filePath = path.map(decodeURIComponent).join("/");
  const parentPath = path.length > 1 ? path.slice(0, -1).map(decodeURIComponent).join("/") : undefined;
  const repo = await getRepository(decodedOwner, decodedName);
  const selectedRef = ref || repo.default_branch;
  const baseHref = repoHref(decodedOwner, decodedName);
  const [pullRequests, branches, tags, tree, fullTree, file] = await Promise.all([
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })),
    listRepositoryBranches(decodedOwner, decodedName).catch(() => ({
      data: [{ name: repo.default_branch, is_default: true, commit_sha: null }],
    })),
    listRepositoryTags(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getRepositoryTree(decodedOwner, decodedName, selectedRef, parentPath).catch(
      (): RepositoryTree => ({ ref_name: selectedRef, last_commit: null, entries: [] }),
    ),
    getRepositoryTree(decodedOwner, decodedName, selectedRef, undefined, { includeLastCommit: false, recursive: true }).catch(
      (): RepositoryTree => ({ ref_name: selectedRef, last_commit: null, entries: [] }),
    ),
    getRepositoryFile(decodedOwner, decodedName, filePath, selectedRef),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.pagination?.total ?? pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <RepositoryCodeBrowser
          baseHref={baseHref}
          branches={branches.data}
          currentPath={filePath}
          file={file}
          fullTree={fullTree}
          mode="blob"
          owner={decodedOwner}
          repo={repo}
          selectedRef={selectedRef}
          tags={tags.data}
          tree={tree}
        />
      </RepoPageContent>
    </div>
  );
}
