import {
  getRepository,
  getRepositoryFile,
  getRepositoryTree,
  listPullRequests,
  listRepositoryBranches,
  listRepositoryTags,
  type RepositoryFile,
  type RepositoryTree,
} from "~/lib/api";
import { getRepositoryReadme } from "~/lib/repository-readme";

type CodeBrowserMode = "blob" | "tree";

type LoadRepositoryCodeBrowserOptions = {
  currentPath?: string;
  mode: CodeBrowserMode;
  query?: string;
  ref?: string | null;
};

export async function loadRepositoryCodeBrowser(
  owner: string,
  name: string,
  { currentPath = "", mode, query = "", ref }: LoadRepositoryCodeBrowserOptions,
) {
  const repository = await getRepository(owner, name).catch(() => null);
  if (!repository) {
    return {
      repository: null,
    };
  }

  const selectedRef = ref?.trim() || repository.default_branch;
  const treePath =
    mode === "blob" ? parentDirectoryPath(currentPath) : currentPath || undefined;

  const [pullRequests, branches, tags, tree, fullTree, file] = await Promise.all([
    listPullRequests(owner, name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listRepositoryBranches(owner, name).catch(() => ({
      data: [{ name: repository.default_branch, is_default: true, commit_sha: null }],
    })),
    listRepositoryTags(owner, name).catch(() => ({ data: [] })),
    getRepositoryTree(owner, name, selectedRef, treePath).catch(
      (): RepositoryTree => ({
        ref_name: selectedRef,
        last_commit: null,
        entries: [],
      }),
    ),
    getRepositoryTree(owner, name, selectedRef, undefined, {
      includeLastCommit: false,
      recursive: true,
    }).catch(
      (): RepositoryTree => ({
        ref_name: selectedRef,
        last_commit: null,
        entries: [],
      }),
    ),
    mode === "blob" && currentPath
      ? getRepositoryFile(owner, name, currentPath, selectedRef).catch(() => null)
      : Promise.resolve(null),
  ]);

  const readme =
    mode === "tree"
      ? await getRepositoryReadme(owner, name, selectedRef, tree.entries)
      : null;

  return {
    branches: branches.data,
    currentPath,
    file: file as RepositoryFile | null,
    fullTree,
    pullRequestsCount: pullRequests.pagination?.total ?? pullRequests.data.length,
    query,
    readme,
    repository,
    selectedRef,
    tags: tags.data,
    tree,
  };
}

export function decodeCodeBrowserPath(path: string | undefined) {
  if (!path) {
    return "";
  }

  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function parentDirectoryPath(path: string) {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.length > 0 ? segments.join("/") : undefined;
}
