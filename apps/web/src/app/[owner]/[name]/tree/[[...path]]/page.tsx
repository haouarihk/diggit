import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { RepositoryCodeBrowser } from "@/components/RepositoryCodeBrowser";
import {
  getRepository,
  getRepositoryTree,
  listPullRequests,
  listRepositoryBranches,
  listRepositoryTags,
  type RepositoryTree,
} from "@/lib/api";
import { getRepositoryReadme } from "@/lib/repository-readme";

type Props = {
  params: Promise<{ owner: string; name: string; path?: string[] }>;
  searchParams: Promise<{ q?: string; ref?: string }>;
};

export default async function RepositoryTreePage({ params, searchParams }: Props) {
  const { owner, name, path = [] } = await params;
  const { q, ref } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const currentPath = path.map(decodeURIComponent).join("/");
  const repo = await getRepository(decodedOwner, decodedName);
  const selectedRef = ref || repo.default_branch;
  const baseHref = repoHref(decodedOwner, decodedName);
  const [pullRequests, branches, tags, tree, fullTree] = await Promise.all([
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listRepositoryBranches(decodedOwner, decodedName).catch(() => ({
      data: [{ name: repo.default_branch, is_default: true, commit_sha: null }],
    })),
    listRepositoryTags(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getRepositoryTree(decodedOwner, decodedName, selectedRef, currentPath || undefined).catch(
      (): RepositoryTree => ({ ref_name: selectedRef, last_commit: null, entries: [] }),
    ),
    getRepositoryTree(decodedOwner, decodedName, selectedRef, undefined, { includeLastCommit: false, recursive: true }).catch(
      (): RepositoryTree => ({ ref_name: selectedRef, last_commit: null, entries: [] }),
    ),
  ]);
  const readme = await getRepositoryReadme(decodedOwner, decodedName, selectedRef, tree.entries);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <RepositoryCodeBrowser
          baseHref={baseHref}
          branches={branches.data}
          currentPath={currentPath || undefined}
          fullTree={fullTree}
          mode="tree"
          owner={decodedOwner}
          query={q}
          readme={readme}
          repo={repo}
          selectedRef={selectedRef}
          tags={tags.data}
          tree={tree}
        />
      </RepoPageContent>
    </div>
  );
}
