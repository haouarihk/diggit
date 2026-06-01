import Link from "next/link";
import { FileDeleteButton } from "@/components/FileDeleteButton";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { RepoHeader } from "@/components/RepoHeader";
import { SyncForkButton } from "@/components/SyncForkButton";
import {
  apiFetch,
  compareUpstream,
  getRepositoryFile,
  getRepositoryTree,
  repositoryRawFileUrl,
  type RepositoryCompare,
  type PullRequest,
  type Repository,
  type RepositoryCommit,
  type RepositoryFile,
  type RepositoryTree,
  type RepositoryTreeEntry,
} from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
  searchParams: Promise<{
    file?: string;
  }>;
};

export default async function RepoPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { file } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = `/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}`;
  const repo = await apiFetch<Repository>(baseHref);
  const [pullRequests, tree, upstreamCompare] = await Promise.all([
    apiFetch<{ data: PullRequest[] }>(`${baseHref}/pull-requests`).catch(() => ({ data: [] })),
    getRepositoryTree(decodedOwner, decodedName).catch(
      (): RepositoryTree => ({
        ref_name: repo.default_branch,
        last_commit: null,
        entries: [],
      }),
    ),
    repo.source_repository_id || repo.source_remote_url
      ? compareUpstream(decodedOwner, decodedName).catch(
          (): RepositoryCompare => ({
            status: "unavailable",
            source: repo.source_repository,
            ahead_by: 0,
            behind_by: 0,
            ahead_commits: [],
            behind_commits: [],
            files: [],
            message: "Upstream comparison is unavailable.",
          }),
        )
      : Promise.resolve(null),
  ]);
  const readme = findReadme(tree.entries);
  const selectedPath = file ?? readme?.path;
  const selectedFile = selectedPath
    ? await getRepositoryFile(decodedOwner, decodedName, selectedPath).catch(() => null)
    : null;

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="grid min-w-0 gap-6">
          {upstreamCompare ? (
            <ForkStatusBanner compare={upstreamCompare} name={decodedName} owner={decodedOwner} />
          ) : null}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md border border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <AuthorAvatar commit={tree.last_commit} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {tree.last_commit?.message ?? "No commits yet"}
                  </div>
                  <div className="text-xs text-[#59636e]">
                    {tree.last_commit ? `${tree.last_commit.author_name} committed ${formatDate(tree.last_commit.created_at)}` : "Push code to populate this repository."}
                  </div>
                </div>
              </div>
              <div className="text-xs text-[#59636e]">Created {formatDate(repo.created_at)}</div>
              <Link className="text-xs font-semibold text-[#0969da] hover:underline" href={`${baseHref}/commits`}>
                View commits
              </Link>
            </div>
            <FileTable
              baseHref={baseHref}
              name={decodedName}
              entries={tree.entries}
              owner={decodedOwner}
              selectedPath={selectedPath}
            />
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md border border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
              <span className="font-semibold">{selectedFile?.path ?? readme?.path ?? "README.md"}</span>
              {selectedFile ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!selectedFile.is_binary ? (
                    <Link
                      className="inline-flex rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]"
                      href={`${baseHref}/edit?file=${encodeURIComponent(selectedFile.path)}`}
                    >
                      Edit
                    </Link>
                  ) : null}
                  <FileDeleteButton
                    name={decodedName}
                    owner={decodedOwner}
                    path={selectedFile.path}
                    redirectTo={baseHref}
                    variant="danger"
                  />
                </div>
              ) : null}
            </div>
            <RepositoryFilePreview
              file={selectedFile}
              rawUrl={
                selectedFile
                  ? repositoryRawFileUrl(decodedOwner, decodedName, selectedFile.path)
                  : null
              }
              repo={repo}
            />
          </section>

        </main>

        <aside className="grid gap-4">
          <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
            <h2 className="text-base font-semibold">About</h2>
            <p className="text-[#59636e]">{repo.description || "No description provided."}</p>
            <div className="grid gap-2 border-t border-[#d8dee4] pt-3 text-sm">
              <RepoFact label="Branch" value={repo.default_branch} />
              <RepoFact label="Language" value={repo.dominant_language || "Unknown"} />
              <RepoFact label="Stars" value={String(repo.stars_count)} />
              <RepoFact label="Updated" value={formatDate(repo.updated_at)} />
              {repo.source_repository_id || repo.source_remote_url ? <RepoFact label="Type" value="Fork" /> : null}
            </div>
          </section>

          <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
            <h2 className="text-base font-semibold">Clone</h2>
            <CloneUrl label="SSH" value={repo.ssh_url} />
            <CloneUrl label="HTTP" value={repo.http_url} />
          </section>

          <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
            <h2 className="text-base font-semibold">Repository actions</h2>
            <Link className="inline-flex justify-center rounded-md border border-black/15 bg-white px-3 py-1.5 font-bold text-[#1f2328]" href={`${baseHref}/actions`}>
              View actions
            </Link>
            <Link className="inline-flex justify-center rounded-md border border-black/15 bg-white px-3 py-1.5 font-bold text-[#1f2328]" href={`${baseHref}/settings/runners`}>
              Manage runners
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ForkStatusBanner({
  compare,
  name,
  owner,
}: {
  compare: RepositoryCompare;
  name: string;
  owner: string;
}) {
  const source = compare.source;
  return (
    <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Fork status</h2>
          <p className="text-sm text-[#59636e]">
            {source ? (
              <>
                Forked from{" "}
                <Link className="font-semibold text-[#0969da] hover:underline" href={source.url}>
                  {source.owner_handle}/{source.name}
                </Link>
              </>
            ) : (
              "Original repository unavailable."
            )}
          </p>
        </div>
        <Link className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 text-sm font-semibold text-[#1f2328]" href={`/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare-upstream`}>
          Compare
        </Link>
      </div>
      {compare.status === "unavailable" ? (
        <p className="text-sm text-[#59636e]">{compare.message ?? "Upstream comparison is unavailable."}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
          <span>{compare.ahead_by} commits ahead</span>
          <span>{compare.behind_by} commits behind</span>
          <span className="rounded-full border border-[#d0d7de] px-2 py-0.5">{compare.status.replaceAll("_", " ")}</span>
        </div>
      )}
      {compare.behind_by > 0 ? (
        <SyncForkButton disabled={compare.status === "unavailable"} name={name} owner={owner} />
      ) : null}
    </section>
  );
}

function FileTable({
  baseHref,
  name,
  entries,
  owner,
  selectedPath,
}: {
  baseHref: string;
  name: string;
  entries: RepositoryTreeEntry[];
  owner: string;
  selectedPath?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-4 text-[#59636e]">
        This repository does not have files on the default branch yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-b-md border border-t-0 border-[#d0d7de] bg-white">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_92px] gap-4 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#59636e] md:grid">
        <span>Name</span>
        <span>Last commit</span>
        <span>Last edit</span>
        <span>Actions</span>
      </div>
      {entries.map((entry) => {
        const isSelected = entry.path === selectedPath;
        return (
          <div
            className={`grid gap-2 border-b border-[#d8dee4] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_92px] md:gap-4 ${
              isSelected ? "bg-[#ddf4ff]" : "bg-white"
            }`}
            key={entry.path}
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileIcon entry={entry} />
              {entry.kind === "file" ? (
                <Link className="truncate font-semibold text-[#0969da] hover:underline" href={`${baseHref}?file=${encodeURIComponent(entry.path)}`}>
                  {entry.name}
                </Link>
              ) : (
                <span className="truncate font-semibold text-[#1f2328]">{entry.name}</span>
              )}
            </div>
            <div className="min-w-0 truncate text-[#59636e]">
              {entry.last_commit?.message ?? "No commit message"}
            </div>
            <div className="text-[#59636e]">{formatDate(entry.last_commit?.created_at)}</div>
            <FileDeleteButton name={name} owner={owner} path={entry.path} redirectTo={baseHref} />
          </div>
        );
      })}
    </div>
  );
}

function RepositoryFilePreview({
  file,
  rawUrl,
  repo,
}: {
  file: RepositoryFile | null;
  rawUrl: string | null;
  repo: Repository;
}) {
  if (!file) {
    return (
      <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5">
        <h2 className="mb-2 text-base font-semibold">No README found</h2>
        <p className="text-[#59636e]">
          Add a README.md file to describe {repo.owner_handle}/{repo.name}.
        </p>
      </div>
    );
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

  if (isMarkdownFile(file)) {
    return <MarkdownViewer content={file.content} fileName={file.path} />;
  }

  return (
    <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#d8dee4] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileIcon entry={{ extension: file.extension, kind: "file", name: file.name }} />
          <span className="truncate font-semibold">{file.path}</span>
        </div>
        <span className="text-xs text-[#59636e]">{formatBytes(file.size)}</span>
      </div>
      <pre className="max-h-[560px] overflow-auto p-4 text-sm leading-6">
        <code>{file.content}</code>
      </pre>
    </div>
  );
}

function AuthorAvatar({ commit }: { commit: RepositoryCommit | null }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d0d7de] text-xs font-bold text-[#24292f]">
      {commit?.avatar_fallback ?? "DG"}
    </span>
  );
}

function FileIcon({ entry }: { entry: Pick<RepositoryTreeEntry, "extension" | "kind" | "name"> }) {
  const label = entry.kind === "directory" ? "DIR" : iconLabel(entry.extension, entry.name);
  return (
    <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-1.5 text-[10px] font-bold text-[#59636e]">
      {label}
    </span>
  );
}

function RepoFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#59636e]">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function CloneUrl({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#59636e]">{label}</span>
      <div className="break-all rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-2 font-mono text-xs">
        {value}
      </div>
    </div>
  );
}

function findReadme(entries: RepositoryTreeEntry[]) {
  return entries.find((entry) => entry.kind === "file" && /^readme\.mdx?$/i.test(entry.name));
}

function isMarkdownFile(file: RepositoryFile) {
  return file.extension === "md" || file.extension === "mdx";
}

function iconLabel(extension: string | null, name: string) {
  const lowerName = name.toLowerCase();
  if (extension === "md" || extension === "mdx") {
    return "MD";
  }
  if (extension === "ts" || extension === "tsx") {
    return "TS";
  }
  if (extension === "js" || extension === "jsx") {
    return "JS";
  }
  if (extension === "json") {
    return "JSON";
  }
  if (extension === "rs") {
    return "RS";
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension ?? "")) {
    return "IMG";
  }
  if (lowerName === "dockerfile" || extension === "yml" || extension === "yaml") {
    return "CFG";
  }
  return "FILE";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
