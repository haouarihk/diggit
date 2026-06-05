import Link from "next/link";
import moment from "moment";
import type { ReactNode } from "react";
import { FileDeleteButton } from "@/components/FileDeleteButton";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import {
  repositoryRawFileUrl,
  type Repository,
  type RepositoryBranch,
  type RepositoryCommit,
  type RepositoryFile,
  type RepositoryTag,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "@/lib/api";

type RepositoryCodeBrowserProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  currentPath?: string;
  file?: RepositoryFile | null;
  mode: "tree" | "blob";
  owner: string;
  query?: string;
  repo: Repository;
  selectedRef: string;
  tags: RepositoryTag[];
  tree: RepositoryTree;
};

export function RepositoryCodeBrowser({
  baseHref,
  branches,
  currentPath,
  file,
  mode,
  owner,
  query = "",
  repo,
  selectedRef,
  tags,
  tree,
}: RepositoryCodeBrowserProps) {
  const canModifySelectedBranch = selectedRef === repo.default_branch;
  const filteredEntries = query
    ? tree.entries.filter((entry) => entry.path.toLowerCase().includes(query.toLowerCase()))
    : tree.entries;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <main className="grid min-w-0 gap-6">
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
            <div className="min-w-0">
              <div className="truncate font-semibold">{currentPath || repo.name}</div>
              <div className="text-xs text-[#59636e]">
                {tree.last_commit ? (
                  <>
                    {tree.last_commit.author_name} committed{" "}
                    <Link className="font-semibold text-[#0969da] hover:underline" href={`${baseHref}/commits/${tree.last_commit.sha}`}>
                      {tree.last_commit.message}
                    </Link>
                  </>
                ) : (
                  "Push code to populate this repository."
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
          </div>
          {mode === "blob" && file ? (
            <RepositoryFilePreview file={file} rawUrl={repositoryRawFileUrl(owner, repo.name, file.path, selectedRef)} repo={repo} />
          ) : (
            <RepositoryFileTable baseHref={baseHref} entries={filteredEntries} selectedRef={selectedRef} />
          )}
        </section>
      </main>
      <aside className="grid gap-4">
        <RepositoryAboutCard repo={repo} selectedRef={selectedRef} />
        {currentPath ? <RepositoryTreeSidebar baseHref={baseHref} entries={tree.entries} selectedPath={currentPath} selectedRef={selectedRef} /> : null}
      </aside>
    </div>
  );
}

function RepositoryAboutCard({ repo, selectedRef }: { repo: Repository; selectedRef: string }) {
  return (
    <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
      <h2 className="text-base font-semibold">About</h2>
      <p className="text-[#59636e]">{repo.description || "No description provided."}</p>
      <div className="grid gap-2 border-t border-[#d8dee4] pt-3 text-sm">
        <RepoFact label="Branch" value={selectedRef} />
        <RepoFact label="Language" value={repo.dominant_language || "Unknown"} />
        <RepoFact label="Stars" value={String(repo.stars_count)} />
        <RepoFact label="Updated" value={<RelativeTime value={repo.updated_at} />} />
        {repo.source_repository_id || repo.source_remote_url ? <RepoFact label="Type" value="Fork" /> : null}
      </div>
    </section>
  );
}

function RepoFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#59636e]">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
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
  const branchExists = Boolean(branches.find((branch) => branch.name === selectedRef)?.commit_sha);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d0d7de] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <RefSelector baseHref={baseHref} label="Branch" refs={branches.map((branch) => branch.name)} selectedRef={selectedRef} />
        <RefSelector baseHref={baseHref} label="Tags" refs={tags.map((tag) => tag.name)} selectedRef={selectedRef} />
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
            <CloneUrl label="SSH" value={cloneCommand(repo.ssh_url, selectedRef, branchExists)} />
            <CloneUrl label="HTTP" value={cloneCommand(repo.http_url, selectedRef, branchExists)} />
          </div>
        </details>
      </div>
    </div>
  );
}

function RefSelector({ baseHref, label, refs, selectedRef }: { baseHref: string; label: string; refs: string[]; selectedRef: string }) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold">
        <span>{label}: {selectedRef}</span>
        <span className="text-xs text-[#59636e]">▼</span>
      </summary>
      <div className="absolute left-0 z-20 mt-2 max-h-80 min-w-56 overflow-auto rounded-md border border-[#d0d7de] bg-white py-2 shadow-lg">
        {refs.map((ref) => (
          <Link className="block px-3 py-2 text-sm hover:bg-[#f6f8fa]" href={codeHref(baseHref, undefined, ref, "tree")} key={ref}>
            {ref}
          </Link>
        ))}
      </div>
    </details>
  );
}

function RepositoryFileTable({ baseHref, entries, selectedRef }: { baseHref: string; entries: RepositoryTreeEntry[]; selectedRef: string }) {
  if (entries.length === 0) {
    return <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-4 text-[#59636e]">No files found.</div>;
  }
  return (
    <div className="overflow-hidden rounded-b-md border border-t-0 border-[#d0d7de] bg-white">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px] gap-4 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#59636e] md:grid">
        <span>Name</span>
        <span>Last commit</span>
        <span>Last edit</span>
      </div>
      {entries.map((entry) => (
        <div className="grid gap-2 border-b border-[#d8dee4] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px] md:gap-4" key={entry.path}>
          <div className="flex min-w-0 items-center gap-3">
            <FileIcon entry={entry} />
            <Link className="truncate font-semibold text-[#0969da] hover:underline" href={codeHref(baseHref, entry.path, selectedRef, entry.kind === "directory" ? "tree" : "blob")}>
              {entry.name}
            </Link>
          </div>
          <div className="min-w-0 truncate text-[#59636e]">
            {entry.last_commit ? (
              <Link className="text-[#0969da] hover:underline" href={`${baseHref}/commits/${entry.last_commit.sha}`}>
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

function RepositoryTreeSidebar({ baseHref, entries, selectedPath, selectedRef }: { baseHref: string; entries: RepositoryTreeEntry[]; selectedPath: string; selectedRef: string }) {
  return (
    <aside className="rounded-md border border-[#d0d7de] bg-white p-3">
      <h2 className="mb-2 font-semibold">Files</h2>
      <div className="grid gap-1 text-sm">
        {entries.map((entry) =>
          entry.kind === "directory" ? (
            <details key={entry.path} open>
              <summary className="cursor-pointer rounded-md px-2 py-1 font-semibold hover:bg-[#f6f8fa]">{entry.name}</summary>
              <Link className="ml-4 block rounded-md px-2 py-1 text-[#59636e] hover:bg-[#f6f8fa]" href={codeHref(baseHref, entry.path, selectedRef, "tree")}>
                Open folder
              </Link>
            </details>
          ) : (
            <Link
              className={`rounded-md px-2 py-1 hover:bg-[#f6f8fa] ${entry.path === selectedPath ? "bg-[#ddf4ff] font-semibold text-[#0969da]" : "text-[#59636e]"}`}
              href={codeHref(baseHref, entry.path, selectedRef, "blob")}
              key={entry.path}
            >
              {entry.name}
            </Link>
          ),
        )}
      </div>
    </aside>
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

function FileIcon({ entry }: { entry: Pick<RepositoryTreeEntry, "extension" | "kind" | "name"> }) {
  return (
    <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-1.5 text-[10px] font-bold text-[#59636e]">
      {entry.kind === "directory" ? "DIR" : entry.extension?.toUpperCase().slice(0, 4) || "FILE"}
    </span>
  );
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

function cloneCommand(url: string, ref: string, refExists: boolean) {
  return refExists ? `git clone --branch ${shellArg(ref)} ${shellArg(url)}` : `git clone ${shellArg(url)}`;
}

function shellArg(value: string) {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
