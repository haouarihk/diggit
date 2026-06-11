import Link from "next/link";
import moment from "moment";
import type { ReactNode } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ChartPie,
  Code2,
  GitBranch,
  Tag,
  Users,
  FolderOpen,
  Folder,
} from "lucide-react";
import { FileDeleteButton } from "@/components/FileDeleteButton";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { repoHref } from "@/components/RepoHeader";
import { RepositoryRefSelector } from "@/components/RepositoryRefSelector";
import {
  repositoryRawFileUrl,
  type Repository,
  type RepositoryBranch,
  type RepositoryContributor,
  type RepositoryFile,
  type RepositoryLanguage,
  type RepositoryStats,
  type RepositoryTag,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "@/lib/api";
import { OwnerBadge } from "./RepositoryList";
import IconForFile, { FileTypeIcon, README_ENTRY } from "./IconForFile";

type RepositoryCodeBrowserProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  contributors?: RepositoryContributor[];
  currentPath?: string;
  file?: RepositoryFile | null;
  fullTree?: RepositoryTree | null;
  languages?: RepositoryLanguage[];
  mode: "tree" | "blob";
  owner: string;
  query?: string;
  readme?: RepositoryFile | null;
  repo: Repository;
  selectedRef: string;
  stats?: RepositoryStats;
  tags: RepositoryTag[];
  tree: RepositoryTree;
};

export function RepositoryCodeBrowser({
  baseHref,
  branches,
  contributors = [],
  currentPath,
  file,
  fullTree,
  languages = [],
  mode,
  owner,
  query = "",
  readme = null,
  repo,
  selectedRef,
  stats,
  tags,
  tree,
}: RepositoryCodeBrowserProps) {
  const canModifySelectedBranch = selectedRef === repo.default_branch;
  const filteredEntries = query
    ? tree.entries.filter((entry) => entry.path.toLowerCase().includes(query.toLowerCase()))
    : tree.entries;

  if (currentPath) {
    return (
      <div className="w-full min-w-0 pb-10">
        <div className="grid min-h-[calc(100vh-6rem)] min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-4">
            <RepositoryFocusedHeader
              baseHref={baseHref}
              canModifySelectedBranch={canModifySelectedBranch}
              currentPath={currentPath}
              file={file}
              mode={mode}
              owner={owner}
              repo={repo}
              selectedRef={selectedRef}
              tree={tree}
            />
            <section className="min-w-0">
              {mode === "blob" && file ? (
                <RepositoryFilePreview file={file} rawUrl={repositoryRawFileUrl(owner, repo.name, file.path, selectedRef)} repo={repo} />
              ) : (
                <>
                  <RepositoryFileTable baseHref={baseHref} entries={filteredEntries} selectedRef={selectedRef} />
                  <RepositoryReadme readme={readme} />
                </>
              )}
            </section>
          </div>
          <RepositoryTreeNavigationSidebar
            baseHref={baseHref}
            branches={branches}
            currentPath={currentPath}
            entries={fullTree?.entries ?? tree.entries}
            mode={mode}
            repo={repo}
            selectedPath={currentPath}
            selectedRef={selectedRef}
            tags={tags}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid min-w-0 gap-6">
        <RepositoryCodeToolbar
          baseHref={baseHref}
          branches={branches}
          query={query}
          repo={repo}
          selectedRef={selectedRef}
          tags={tags}
        />
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md border border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
            <div className="flex items-center  gap-2 flex-wrap min-w-0">
              <div className="truncate font-semibold">
                <OwnerBadge owner={repo.owner} ownerHandle={repo.owner_handle} withoutHandle />
              </div>
              <div className="text-xs text-[#59636e]">
                {tree.last_commit ? (
                  <>
                    <Link className="font-semibold opacity-50 hover:opacity-100 hover:text-blue-500 hover:underline" href={commitHref(baseHref, tree.last_commit.sha, currentPath)}>
                      {tree.last_commit.message}
                    </Link>
                  </>
                ) : (
                  "Push code to populate this repository."
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mode === "blob" && file ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!file.is_binary && canModifySelectedBranch ? (
                    <Link
                      className="inline-flex rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]"
                      href={`${baseHref}/edit?file=${encodeURIComponent(file.path)}`}
                    >
                      Edit
                    </Link>
                  ) : null}
                  {canModifySelectedBranch ? (
                    <FileDeleteButton name={repo.name} owner={owner} path={file.path} redirectTo={baseHref} variant="danger" />
                  ) : null}
                </div>
              ) : null}

              <div>{tree.last_commit?.created_at ? <span className="text-xs text-[#59636e] pr-15">{moment(tree.last_commit.created_at).fromNow()}</span> : null}
              </div>
            </div>
          </div>


          {mode === "blob" && file ? (
            <RepositoryFilePreview file={file} rawUrl={repositoryRawFileUrl(owner, repo.name, file.path, selectedRef)} repo={repo} />
          ) : (
            <>
              <RepositoryFileTable baseHref={baseHref} entries={filteredEntries} selectedRef={selectedRef} />
              <RepositoryReadme readme={readme} />
            </>
          )}
        </section>
      </div>
      <aside className="grid gap-4">
        <RepositoryAboutCard repo={repo} stats={stats} />
        <RepositoryContributorsCard contributors={contributors} />
        <RepositoryLanguagesCard languages={languages} />
      </aside>
    </div>
  );
}

function RepositoryAboutCard({ repo, stats }: { repo: Repository; stats?: RepositoryStats }) {
  const repoStats = stats ?? {
    branches_count: 0,
    commits_count: 0,
    releases_count: 0,
    tags_count: 0,
  };

  return (
    <section className="grid gap-3 p-4 border-b dark:border-gray-700/50 border-gray-200">
      <h2 className="text-base font-semibold">About</h2>
      <p className="text-[#59636e]">{repo.description || "No description provided."}</p>
      <div className="grid gap-2 border-t border-[#d8dee4] pt-3 text-sm">
        <RepoStat href={`${repoHref(repo.owner_handle, repo.name)}/commits`} icon={<Code2 className="h-4 w-4" aria-hidden="true" />} label="Commits" value={repoStats.commits_count} />
        <RepoStat icon={<GitBranch className="h-4 w-4" aria-hidden="true" />} label="Branches" value={repoStats.branches_count} />
        <RepoStat icon={<Tag className="h-4 w-4" aria-hidden="true" />} label="Tags" value={repoStats.tags_count} />
        <RepoStat icon={<Archive className="h-4 w-4" aria-hidden="true" />} label="Releases" value={repoStats.releases_count} />
        {repo.source_repository_id || repo.source_remote_url ? <RepoFact label="Type" value="Fork" /> : null}
      </div>
    </section>
  );
}

function RepoStat({ href, icon, label, value }: { href?: string; icon: ReactNode; label: string; value: number }) {
  return <RepoFact href={href} icon={icon} label={label} value={`${formatCount(value)}`} />;
}

function RepoFact({ href, icon, label, value }: { href?: string; icon?: ReactNode; label: string; value: ReactNode }) {
  const content = (
    <>
      <span className="inline-flex items-center gap-2 text-[#59636e]">
        {icon ? <span className="text-[#59636e]">{icon}</span> : null}
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </>
  );

  if (href) {
    return (
      <Link className="flex items-center justify-between gap-3 rounded-md hover:text-[#0969da]" href={href}>
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      {content}
    </div>
  );
}

function RepositoryContributorsCard({ contributors }: { contributors: RepositoryContributor[] }) {
  const visibleContributors = contributors.slice(0, 5);
  const hiddenContributors = contributors.slice(5);

  return (
    <section className="grid gap-3 border-b dark:border-gray-700/50 border-gray-200 p-4">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold">
        <Users className="h-4 w-4 text-[#59636e]" aria-hidden="true" />
        Contributors
      </h2>
      {contributors.length > 0 ? (
        <div className="grid gap-2">
          {visibleContributors.map((contributor) => (
            <ContributorListItem contributor={contributor} key={contributor.username ?? contributor.name} />
          ))}
          {hiddenContributors.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none pt-1 text-sm font-semibold text-[#0969da] hover:underline">
                Show more
              </summary>
              <div className="mt-2 grid gap-2">
                {hiddenContributors.map((contributor) => (
                  <ContributorListItem contributor={contributor} key={contributor.username ?? contributor.name} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[#59636e]">No contributors yet.</p>
      )}
    </section>
  );
}

function ContributorListItem({ contributor }: { contributor: RepositoryContributor }) {
  const content = (
    <>
      {contributor.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-8 w-8 rounded-full bg-[#d0d7de]" src={contributor.avatar_url} />
      ) : (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#d0d7de] text-xs font-bold">
          {contributor.avatar_fallback}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-semibold">{contributor.name}</span>
      <span className="text-xs text-[#59636e]">{contributor.commits}</span>
    </>
  );

  if (!contributor.username) {
    return <div className="flex min-w-0 items-center gap-3 text-sm">{content}</div>;
  }

  return (
    <Link className="flex min-w-0 items-center gap-3 rounded-md text-sm hover:text-[#0969da]" href={`/users/${encodeURIComponent(contributor.username)}`}>
      {content}
    </Link>
  );
}

function RepositoryLanguagesCard({ languages }: { languages: RepositoryLanguage[] }) {
  return (
    <section className="grid gap-3 p-4">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold">
        <ChartPie className="h-4 w-4 text-[#59636e]" aria-hidden="true" />
        Languages
      </h2>
      {languages.length > 0 ? (
        <>
          <div className="mx-auto h-36 w-36 rounded-full border border-[#d0d7de]" style={{ background: languageGradient(languages) }} />
          <div className="grid gap-2 text-sm">
            {languages.map((language) => (
              <div className="flex items-center justify-between gap-3" key={language.language}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: language.color }} />
                  <span className="truncate">{language.language}</span>
                </span>
                <span className="font-medium">{formatPercentage(language.percentage)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-[#59636e]">No language data yet.</p>
      )}
    </section>
  );
}

function RepositoryCodeToolbar({
  baseHref,
  branches,
  query,
  repo,
  selectedRef,
  tags,
}: {
  baseHref: string;
  branches: RepositoryBranch[];
  query: string;
  repo: Repository;
  selectedRef: string;
  tags: RepositoryTag[];
}) {
  const selectedRefExists = Boolean(branches.find((branch) => branch.name === selectedRef)?.commit_sha || tags.find((tag) => tag.name === selectedRef)?.commit_sha);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d0d7de] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <RepositoryRefSelector baseHref={baseHref} branches={branches} key={selectedRef} selectedRef={selectedRef} tags={tags} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={baseHref} className="flex gap-2">
          <input name="ref" type="hidden" value={selectedRef} />
          <input className="w-44 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm" defaultValue={query} name="q" placeholder="Find file" />
        </form>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white">
            Code
          </summary>
          <div className="absolute right-0 z-20 mt-2 grid w-80 gap-3 rounded-md border border-[#d0d7de] bg-white p-3 shadow-lg">
            <CloneUrl label="SSH" value={cloneCommand(repo.ssh_url, selectedRef, repo.default_branch, selectedRefExists)} />
            <CloneUrl label="HTTP" value={cloneCommand(repo.http_url, selectedRef, repo.default_branch, selectedRefExists)} />
          </div>
        </details>
      </div>
    </div>
  );
}

function RepositoryFileTable({ baseHref, entries, selectedRef }: { baseHref: string; entries: RepositoryTreeEntry[]; selectedRef: string }) {
  if (entries.length === 0) {
    return <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-4 text-[#59636e]">No files found.</div>;
  }
  return (
    <div className="overflow-hidden rounded-b-md border border-t-0 border-[#d0d7de] bg-white">
      {/* <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px] gap-4 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#59636e] md:grid">
        <span>Name</span>
        <span>Last commit</span>
        <span>Last edit</span>
      </div> */}
      {entries.map((entry) => (
        <div className="grid gap-2 border-b border-[#d8dee4] opacity-80 hover:opacity-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px] md:gap-4" key={entry.path}>
          <div className="flex min-w-0 items-center gap-3">
            <IconForFile entry={entry} />
            <Link className="truncate font-semibold text-[#0969da] hover:underline" href={codeHref(baseHref, entry.path, selectedRef, entry.kind === "directory" ? "tree" : "blob")}>
              {entry.name}
            </Link>
          </div>
          <div className="min-w-0 truncate text-[#59636e]">
            {entry.last_commit ? (
              <Link className="text-[#0969da] hover:underline" href={commitHref(baseHref, entry.last_commit.sha, entry.path)}>
                {entry.last_commit.message}
              </Link>
            ) : (
              "No commit message"
            )}
          </div>
          <RelativeTime value={entry.last_commit?.created_at} />
        </div>
      ))}
    </div>
  );
}

function RepositoryFocusedHeader({
  baseHref,
  canModifySelectedBranch,
  currentPath,
  file,
  mode,
  owner,
  repo,
  selectedRef,
  tree,
}: {
  baseHref: string;
  canModifySelectedBranch: boolean;
  currentPath: string;
  file?: RepositoryFile | null;
  mode: "tree" | "blob";
  owner: string;
  repo: Repository;
  selectedRef: string;
  tree: RepositoryTree;
}) {
  const commit = mode === "blob" ? file?.last_commit : tree.last_commit;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#d0d7de] bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <RepositoryPathBreadcrumbs baseHref={baseHref} currentPath={currentPath} mode={mode} repo={repo} selectedRef={selectedRef} />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#59636e]">
          {commit ? (
            <>
              <span>{commit.author_name} updated</span>
              <Link className="max-w-md truncate font-semibold text-[#0969da] hover:underline" href={commitHref(baseHref, commit.sha, currentPath)}>
                {commit.message}
              </Link>
              <span aria-hidden="true">&middot;</span>
              <RelativeTime value={commit.created_at} />
            </>
          ) : (
            "No commit information for this path."
          )}
        </div>
      </div>
      {mode === "blob" && file ? (
        <div className="flex flex-wrap items-center gap-2">
          {!file.is_binary && canModifySelectedBranch ? (
            <Link
              className="inline-flex rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]"
              href={`${baseHref}/edit?file=${encodeURIComponent(file.path)}`}
            >
              Edit
            </Link>
          ) : null}
          {canModifySelectedBranch ? (
            <FileDeleteButton name={repo.name} owner={owner} path={file.path} redirectTo={baseHref} variant="danger" />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function RepositoryPathBreadcrumbs({
  baseHref,
  currentPath,
  mode,
  repo,
  selectedRef,
}: {
  baseHref: string;
  currentPath: string;
  mode: "tree" | "blob";
  repo: Repository;
  selectedRef: string;
}) {
  const segments = currentPath.split("/").filter(Boolean);
  const pathSegments = segments.map((segment, index) => ({
    isLast: index === segments.length - 1,
    path: segments.slice(0, index + 1).join("/"),
    segment,
  }));

  return (
    <nav aria-label="Repository path" className="flex min-w-0 flex-wrap items-center gap-1 text-lg font-semibold">
      <Link className="truncate text-[#0969da] hover:underline" href={codeHref(baseHref, undefined, selectedRef, "tree")}>
        {repo.name}
      </Link>
      {pathSegments.map(({ isLast, path, segment }) => (
        <span className="inline-flex min-w-0 items-center gap-1" key={path}>
          <span className="text-[#59636e]">/</span>
          {isLast ? (
            <span className="min-w-0 truncate text-[#1f2328]">{segment}</span>
          ) : (
            <Link className="min-w-0 truncate text-[#0969da] hover:underline" href={codeHref(baseHref, path, selectedRef, "tree")}>
              {segment}
            </Link>
          )}
        </span>
      ))}
      {mode === "tree" ? <span className="sr-only">folder</span> : null}
    </nav>
  );
}

function RepositoryTreeNavigationSidebar({
  baseHref,
  branches,
  currentPath,
  entries,
  mode,
  repo,
  selectedPath,
  selectedRef,
  tags,
}: {
  baseHref: string;
  branches: RepositoryBranch[];
  currentPath: string;
  entries: RepositoryTreeEntry[];
  mode: "tree" | "blob";
  repo: Repository;
  selectedPath: string;
  selectedRef: string;
  tags: RepositoryTag[];
}) {
  const parentPath = parentDirectoryPath(currentPath);
  const treeNodes = buildRepositoryTreeNodes(entries);

  return (
    <aside className="overflow-hidden rounded-2xl border border-[#d0d7de] bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
      <div className="border-b border-[#d8dee4] p-4">
        <Link className="block truncate text-base font-semibold text-[#0969da] hover:underline" href={baseHref}>
          {repo.owner_handle}/{repo.name}
        </Link>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#59636e]">
          {mode === "blob" ? "File browser" : "Folder browser"}
        </p>
      </div>

      <div className="grid gap-3 border-b border-[#d8dee4] p-3">
        <div className="flex flex-wrap gap-2">
          <RepositoryRefSelector baseHref={baseHref} branches={branches} key={selectedRef} selectedRef={selectedRef} tags={tags} />
        </div>
        <div className="grid gap-1">
          <Link
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#1f2328] hover:bg-[#f6f8fa]"
            href={codeHref(baseHref, undefined, selectedRef, "tree")}
          >
            <FolderOpen className="h-4 w-4 text-[#0969da]" aria-hidden="true" />
            Repository root
          </Link>
          {currentPath ? (
            <Link
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#1f2328]"
              href={parentPath ? codeHref(baseHref, parentPath, selectedRef, "tree") : codeHref(baseHref, undefined, selectedRef, "tree")}
            >
              <Folder className="h-4 w-4" aria-hidden="true" />
              Up one level
            </Link>
          ) : null}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-2 xl:max-h-[calc(100vh-19rem)]">
        {treeNodes.length > 0 ? (
          <div className="grid gap-1">
            {treeNodes.map((node) => (
              <RepositoryTreeNavigationNode
                baseHref={baseHref}
                depth={0}
                key={node.entry.path}
                node={node}
                selectedPath={selectedPath}
                selectedRef={selectedRef}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#d0d7de] p-4 text-sm text-[#59636e]">This folder is empty.</div>
        )}
      </div>
    </aside>
  );
}

type RepositoryTreeNode = {
  children: RepositoryTreeNode[];
  entry: RepositoryTreeEntry;
};

function RepositoryTreeNavigationNode({
  baseHref,
  depth,
  node,
  selectedPath,
  selectedRef,
}: {
  baseHref: string;
  depth: number;
  node: RepositoryTreeNode;
  selectedPath: string;
  selectedRef: string;
}) {
  const { entry } = node;
  const isSelected = entry.path === selectedPath;
  const isDirectory = entry.kind === "directory";
  const isExpanded = isDirectory && (isSelected || selectedPath.startsWith(`${entry.path}/`));
  const hasChildren = node.children.length > 0;
  const paddingLeft = `${0.75 + depth * 0.9}rem`;

  return (
    <div className="grid gap-1">
      <Link
        className={`group flex min-w-0 items-center gap-2 rounded-xl py-2 pr-3 transition ${isSelected ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#1f2328]"
          }`}
        href={codeHref(baseHref, entry.path, selectedRef, isDirectory ? "tree" : "blob")}
        style={{ paddingLeft }}
      >
        {isDirectory ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <IconForFile active={isSelected} entry={entry} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</span>
      </Link>
      {isExpanded && hasChildren ? (
        <div className="grid gap-1">
          {node.children.map((child) => (
            <RepositoryTreeNavigationNode
              baseHref={baseHref}
              depth={depth + 1}
              key={child.entry.path}
              node={child}
              selectedPath={selectedPath}
              selectedRef={selectedRef}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}


function RepositoryReadme({ readme }: { readme?: RepositoryFile | null }) {
  if (!readme) {
    return null;
  }

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 rounded-t-md border border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 font-semibold">
        <FileTypeIcon entry={README_ENTRY} />
        <span className="font-semibold">{README_ENTRY.name}</span>

      </div>
      <MarkdownViewer content={readme.content} />
    </section>
  );
}

function RepositoryFilePreview({ file, rawUrl, repo }: { file: RepositoryFile | null; rawUrl: string | null; repo: Repository }) {
  if (!file) {
    return <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5 text-[#59636e]">No file selected in {repo.name}.</div>;
  }
  if (rawUrl && file.media_type.startsWith("image/")) {
    return (
      <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={file.name} className="max-h-[720px] max-w-full rounded-md border border-[#d8dee4] object-contain" src={rawUrl} />
      </div>
    );
  }
  if (rawUrl && file.media_type.startsWith("video/")) {
    return (
      <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5">
        <video className="max-h-[720px] w-full rounded-md border border-[#d8dee4] bg-black" controls src={rawUrl} />
      </div>
    );
  }
  if (rawUrl && file.media_type === "application/pdf") {
    return (
      <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5">
        <iframe className="h-[720px] w-full rounded-md border border-[#d8dee4]" src={rawUrl} title={file.name} />
      </div>
    );
  }
  if (file.extension === "md" || file.extension === "mdx") {
    return <MarkdownViewer content={file.content} fileName={file.path} />;
  }
  return (
    <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#d8dee4] px-4 py-3">
        <span className="truncate font-semibold">{file.path}</span>
        <span className="text-xs text-[#59636e]">{formatBytes(file.size)}</span>
      </div>
      <pre className="max-h-[560px] overflow-auto p-4 text-sm leading-6">
        <code>{file.content}</code>
      </pre>
    </div>
  );
}

function RelativeTime({ value }: { value?: string | null }) {
  if (!value) {
    return <div className="text-[#59636e]">Never</div>;
  }
  return (
    <div className="text-[#59636e]" title={moment(value).format("LLLL")}>
      {moment(value).fromNow()}
    </div>
  );
}




type MutableRepositoryTreeNode = RepositoryTreeNode & {
  childrenByPath: Map<string, MutableRepositoryTreeNode>;
};

function buildRepositoryTreeNodes(entries: RepositoryTreeEntry[]): RepositoryTreeNode[] {
  const rootNodes = new Map<string, MutableRepositoryTreeNode>();

  for (const entry of sortTreeEntries(entries)) {
    const segments = entry.path.split("/").filter(Boolean);
    let children = rootNodes;
    let path = "";

    segments.forEach((segment, index) => {
      path = path ? `${path}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      const existing = children.get(path);
      const node =
        existing ??
        createMutableTreeNode({
          extension: null,
          kind: isLeaf ? entry.kind : "directory",
          last_commit: null,
          name: segment,
          path,
          size: null,
        });

      if (isLeaf) {
        node.entry = entry;
      }

      children.set(path, node);
      children = node.childrenByPath;
    });
  }

  return finalizeTreeNodes([...rootNodes.values()]);
}

function createMutableTreeNode(entry: RepositoryTreeEntry): MutableRepositoryTreeNode {
  return {
    children: [],
    childrenByPath: new Map(),
    entry,
  };
}

function finalizeTreeNodes(nodes: MutableRepositoryTreeNode[]): RepositoryTreeNode[] {
  return sortTreeNodes(nodes).map((node) => ({
    children: finalizeTreeNodes([...node.childrenByPath.values()]),
    entry: node.entry,
  }));
}

function sortTreeNodes(nodes: MutableRepositoryTreeNode[]) {
  return nodes.sort((a, b) => {
    if (a.entry.kind !== b.entry.kind) {
      return a.entry.kind === "directory" ? -1 : 1;
    }

    return a.entry.name.localeCompare(b.entry.name);
  });
}

function sortTreeEntries(entries: RepositoryTreeEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}

function parentDirectoryPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length > 0 ? parts.join("/") : undefined;
}

function CloneUrl({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#59636e]">{label}</span>
      <div className="break-all rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-2 font-mono text-xs">{value}</div>
    </div>
  );
}

function codeHref(baseHref: string, path: string | undefined, ref: string, mode: "blob" | "tree") {
  const query = new URLSearchParams({ ref });
  return path ? `${baseHref}/${mode}/${path.split("/").map(encodeURIComponent).join("/")}?${query}` : `${baseHref}?${query}`;
}

function commitHref(baseHref: string, sha: string, path?: string) {
  if (!path) {
    return `${baseHref}/commits/${sha}`;
  }

  const query = new URLSearchParams({ path });
  return `${baseHref}/commits/${sha}?${query}`;
}

function cloneCommand(url: string, ref: string, defaultBranch: string, refExists: boolean) {
  return refExists && ref !== defaultBranch ? `git clone --branch ${shellArg(ref)} ${shellArg(url)}` : `git clone ${shellArg(url)}`;
}

function shellArg(value: string) {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function languageGradient(languages: RepositoryLanguage[]) {
  let cursor = 0;
  const segments = languages.map((language, index) => {
    const start = cursor;
    const end = index === languages.length - 1 ? 100 : Math.min(100, cursor + language.percentage);
    cursor = end;
    return `${language.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function formatPercentage(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}
