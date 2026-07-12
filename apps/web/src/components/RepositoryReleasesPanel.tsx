"use client";

import { Drawer } from "@/components/Drawer";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { RepoQueryToolbar } from "@/components/RepoQueryToolbar";
import { ReactionControls } from "@/components/ReactionControls";
import { OwnerBadge } from "@/components/RepositoryList";
import { authHeaders } from "@/lib/auth-session";
import { buildListHref, parseReleaseSearchQuery, toggleReleasePrereleaseQuery, toggleReleaseTagQuery } from "@/lib/repo-list-query";
import { apiBaseUrl } from "@/lib/runtime-config";
import { DotIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CommentAttachment, CommentReaction, PaginatedCollection, Release, ReleaseAsset, RepositoryBranch, RepositoryTag } from "@/lib/api";

const API_URL = apiBaseUrl();

type RepositoryReleasesPanelProps = {
  baseHref: string;
  name: string;
  owner: string;
  pagination: PaginatedCollection<Release>["pagination"];
  query: string;
  releases: Release[];
  status: "published" | "draft" | "all";
  tags: RepositoryTag[];
};

const CREATE_NEW_TAG = "__create_new_tag__";

export function RepositoryReleasesPanel({ baseHref, name, owner, pagination, query, releases, status, tags }: RepositoryReleasesPanelProps) {
  const searchState = parseReleaseSearchQuery(query);

  return (
    <section>
      <RepoQueryToolbar
        action={
          <Link className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]" href={`${baseHref}/releases/new`}>
            New release
          </Link>
        }
        description="Publish version notes and downloadable assets from Git tags."
        filterMenu={{
          icon: "filter",
          items: [
            {
              active: status === "published",
              description: "Show published releases",
              href: releaseListHref(baseHref, { q: query, status: "published" }),
              label: "Published",
            },
            {
              active: status === "draft",
              description: "Show draft releases",
              href: releaseListHref(baseHref, { q: query, status: "draft" }),
              label: "Drafts",
            },
            {
              active: status === "all",
              description: "Show all releases",
              href: releaseListHref(baseHref, { q: query, status: "all" }),
              label: "All",
            },
            {
              active: searchState.isPrerelease,
              description: "Toggle pre-release items",
              href: releaseListHref(baseHref, { q: toggleReleasePrereleaseQuery(query), status }),
              label: "Pre-releases",
            },
          ],
          label: "Filters",
        }}
        formAction={`${baseHref}/releases`}
        hiddenFields={[{ name: "status", value: status }]}
        menus={[
          {
            count: tags.length,
            emptyLabel: "No tags available yet.",
            icon: "tag",
            items: tags.map((tag) => ({
              active: searchState.tag?.toLowerCase() === tag.name.toLowerCase(),
              href: releaseListHref(baseHref, { q: toggleReleaseTagQuery(query, tag.name), status }),
              label: tag.name,
            })),
            label: "Tags",
          },
        ]}
        placeholder="Search releases with is:pre-release tag:v1.0.0"
        query={query}
        title="Releases"
        total={pagination.total}
      />

      {releases.length === 0 ? (
        <div className="grid gap-2 p-6 text-center">
          <h3 className="text-lg font-semibold">No releases found</h3>
          <p className="text-[#59636e]">Create a release from an existing Git tag to share changelogs and assets.</p>
        </div>
      ) : (
        <ReleaseList
          baseHref={baseHref}
          key={`${status}:${query}:${pagination.page}:${pagination.total}:${releases.map((release) => release.id).join(",")}`}
          name={name}
          owner={owner}
          releases={releases}
          tags={tags}
        />
      )}

      {pagination.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8dee4] px-4 py-3 text-sm">
          <span className="text-[#59636e]">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            {pagination.page > 1 ? <PageLink href={releaseListHref(baseHref, { page: pagination.page - 1, q: query, status })} label="Previous" /> : null}
            {pagination.page < pagination.totalPages ? <PageLink href={releaseListHref(baseHref, { page: pagination.page + 1, q: query, status })} label="Next" /> : null}
          </div>
        </div>
      ) : null}

    </section>
  );
}

function ReleaseList({
  baseHref,
  name,
  owner,
  releases,
  tags,
}: {
  baseHref: string;
  name: string;
  owner: string;
  releases: Release[];
  tags: RepositoryTag[];
}) {
  const [releaseItems, setReleaseItems] = useState(releases);

  function updateReleaseItem(updated: Release) {
    setReleaseItems((current) => current.map((release) => (release.id === updated.id ? updated : release)));
  }

  return (
    <div className="flex flex-col gap-12 p-4">
      {releaseItems.map((release) => (
        <ReleaseItem
          baseHref={baseHref}
          key={release.id}
          name={name}
          owner={owner}
          release={release}
          tags={tags}
          titleHref={`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`}
          onReleaseChange={updateReleaseItem}
        />
      ))}
    </div>
  );
}

export function ReleaseItem({
  actions,
  baseHref,
  bodyVariant = "summary",
  name,
  owner,
  release,
  tags,
  titleHref,
  onReleaseChange,
}: {
  actions?: ReactNode;
  baseHref: string;
  bodyVariant?: "summary" | "markdown";
  name: string;
  owner: string;
  release: Release;
  tags: RepositoryTag[];
  titleHref?: string;
  onReleaseChange: (release: Release) => void;
}) {
  return (
    <article className="grid gap-3 border-2 border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2 pb-2">

          <div className="flex flex-wrap items-center gap-2">
            {titleHref ? (
              <Link className="text-lg font-semibold text-[#0969da] hover:underline" href={titleHref}>
                {release.title}
              </Link>
            ) : (
              <h2 className="text-lg font-semibold">{release.title}</h2>
            )}
            <ReleaseBadges release={release} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[#59636e] text-xs opacity-70">
            {release.last_commit ? (
              <>
                <Link className="font-mono text-xs font-semibold hover:text-[#0969da] hover:underline" href={`${baseHref}/commits/${encodeURIComponent(release.last_commit.sha)}`}>
                  <span className="min-w-0 truncate">{firstLine(release.last_commit.message)}</span>
                </Link>
              </>
            ) : null}
            <DotIcon />
            <span>{release.tag_name}</span>
            <span>created {relativeTime(release.created_at)}</span>
            <OwnerBadge owner={releaseOwner(release)} ownerHandle={release.author_handle} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <CompareTagsDropdown baseHref={baseHref} release={release} tags={tags} />
        </div>
      </div>



      {bodyVariant === "markdown" ? (
        <div>
          {release.body || release.body_html ? (
            <MarkdownViewer content={release.body} sanitizedHtml={release.body_html} variant="comment" />
          ) : (
            <p className="text-[#59636e]">No release notes yet.</p>
          )}
        </div>
      ) : release.body ? (
        <p className="line-clamp-2 text-[#59636e]">{release.body}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReleaseReactions name={name} owner={owner} release={release} onReleaseChange={onReleaseChange} />
        {release.assets.length > 0 ? <p className="text-sm text-[#59636e]">{release.assets.length} asset{release.assets.length === 1 ? "" : "s"}</p> : null}
      </div>
    </article>
  );
}

function ReleaseReactions({
  name,
  owner,
  release,
  onReleaseChange,
}: {
  name: string;
  owner: string;
  release: Release;
  onReleaseChange: (release: Release) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);

  async function toggleReaction(reaction: CommentReaction) {
    setIsBusy(true);
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}/reactions`, {
      method: reaction.viewer_reacted ? "DELETE" : "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ emoji: reaction.emoji }),
    });
    setIsBusy(false);
    if (!response.ok) {
      return;
    }
    onReleaseChange((await response.json()) as Release);
  }

  return (
    <ReactionControls disabled={isBusy} reactions={release.reactions} onToggle={(reaction) => void toggleReaction(reaction)} />
  );
}

function CompareTagsDropdown({ baseHref, release, tags }: { baseHref: string; release: Release; tags: RepositoryTag[] }) {
  const comparableTags = tags.filter((tag) => tag.name !== release.tag_name);
  if (comparableTags.length === 0) {
    return null;
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[#f6f8fa]">
        Compare
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid max-h-72 w-64 overflow-y-auto rounded-md border border-[#d0d7de] bg-white p-1.5 shadow-lg">
        {comparableTags.map((tag) => (
          <Link
            className="rounded-md px-3 py-2 text-sm text-[#1f2328] hover:bg-[#f6f8fa]"
            href={`${baseHref}/compare/${encodeURIComponent(tag.name)}...${encodeURIComponent(release.tag_name)}`}
            key={tag.name}
          >
            Compare {tag.name}...{release.tag_name}
          </Link>
        ))}
      </div>
    </details>
  );
}

type ReleaseCreatePanelProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  name: string;
  owner: string;
  tags: RepositoryTag[];
};

export function ReleaseCreatePanel({ baseHref, branches, name, owner, tags }: ReleaseCreatePanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  async function createRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const isCreatingTag = selectedTag === CREATE_NEW_TAG;
    const tagName = String(form.get(isCreatingTag ? "new_tag_name" : "tag_name") ?? "").trim();
    const releaseLabel = form.get("release_label");
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        body: form.get("body"),
        generate_notes: form.get("generate_notes") === "on",
        is_prerelease: releaseLabel === "pre-release",
        status: form.get("status"),
        tag_name: tagName,
        target_ref: isCreatingTag ? form.get("target_ref") : undefined,
        title: form.get("title"),
      }),
    });

    if (!response.ok) {
      setMessage(`Failed to create release: ${response.status}`);
      return;
    }

    const release = (await response.json()) as Release;
    router.push(`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`);
  }

  return (
    <section className="grid gap-5">
      <Link className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/releases`}>
        Back to releases
      </Link>
      <div className="overflow-hidden rounded-2xl border border-[#d0d7de] bg-white shadow-sm">
        <div className="border-b border-[#d8dee4] bg-linear-to-br from-[#f6f8fa] to-white px-5 py-5 sm:px-7">
          <p className="text-sm font-semibold text-[#59636e]">{owner}/{name}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1f2328]">Create a new release</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#59636e]">Pick an existing tag, or create a new tag from a branch, then publish release notes for users and automation.</p>
        </div>

        <form className="grid gap-6 p-5 sm:p-7" onSubmit={createRelease}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-xl border border-[#d0d7de] bg-[#f6f8fa] p-4">
                <div>
                  <h3 className="font-semibold">Release source</h3>
                  <p className="text-sm text-[#59636e]">Use a tag that already exists, or create one from a target branch.</p>
                </div>
                <label className="grid gap-1.5">
                  Tag
                  <select
                    className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5"
                    name="tag_name"
                    required
                    value={selectedTag}
                    onChange={(event) => setSelectedTag(event.target.value)}
                  >
                    <option value="">Select a tag</option>
                    <option value={CREATE_NEW_TAG}>Create a new tag</option>
                    {tags.map((tag) => (
                      <option key={tag.name} value={tag.name}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedTag === CREATE_NEW_TAG ? (
                  <div className="grid gap-3 rounded-lg border border-[#d0d7de] bg-white p-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      New tag name
                      <input className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5" name="new_tag_name" placeholder="v1.0.0" required />
                    </label>
                    <label className="grid gap-1.5">
                      Target branch
                      <select className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5" defaultValue={defaultBranch(branches)} name="target_ref" required>
                        {branches.map((branch) => (
                          <option key={branch.name} value={branch.name}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>

              <label className="grid gap-1.5">
                Release title
                <input className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5 text-lg font-semibold" name="title" placeholder="Defaults to the tag name" />
              </label>

              <label className="grid gap-1.5">
                Release notes
                <textarea className="min-h-72 w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-3 font-mono text-sm leading-6" name="body" placeholder="Write markdown release notes..." />
              </label>
            </div>

            <aside className="grid content-start gap-4 rounded-xl border border-[#d0d7de] bg-[#f6f8fa] p-4">
              <label className="grid gap-1.5">
                Status
                <select className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5" defaultValue="draft" name="status">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-[#d0d7de] bg-white p-3 text-sm">
                <input className="mt-1" name="generate_notes" type="checkbox" />
                <span>
                  <span className="block font-semibold text-[#1f2328]">Generate release notes</span>
                  <span className="text-[#59636e]">Use commit messages if notes are empty.</span>
                </span>
              </label>

              <fieldset className="grid gap-2 border-t border-[#d8dee4] pt-4">
                <legend className="font-semibold">Release label</legend>
                <label className="flex items-center gap-2 rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5">
                  <input defaultChecked name="release_label" type="radio" value="none" />
                  None
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-[#d0d7de] bg-white px-3 py-2.5">
                  <input name="release_label" type="radio" value="pre-release" />
                  Pre-release
                </label>
              </fieldset>
            </aside>
          </div>

          {message ? <p className="rounded-lg border border-[#d0d7de] bg-[#fff8c5] px-3 py-2 text-sm text-[#59636e]">{message}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#d8dee4] pt-5">
            <Link className="rounded-md border border-[#d0d7de] bg-white px-4 py-2 font-semibold" href={`${baseHref}/releases`}>
              Cancel
            </Link>
            <button className="rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white hover:bg-[#116329]" type="submit">
              Create release
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

type ReleaseDetailPanelProps = {
  baseHref: string;
  name: string;
  owner: string;
  release: Release;
  tags: RepositoryTag[];
};

export function ReleaseDetailPanel({ baseHref, name, owner, release, tags }: ReleaseDetailPanelProps) {
  const [currentRelease, setCurrentRelease] = useState(release);

  return (
    <section className="grid gap-4">
      <Link className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/releases`}>
        Back to releases
      </Link>

      <ReleaseItem
        actions={
          currentRelease.viewer_can_update ? (
            <Link className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[#f6f8fa]" href={`${baseHref}/releases/${encodeURIComponent(currentRelease.tag_name)}/edit`}>
              Edit release
            </Link>
          ) : null}
        baseHref={baseHref}
        bodyVariant="markdown"
        name={name}
        owner={owner}
        release={currentRelease}
        tags={tags}
        onReleaseChange={setCurrentRelease}
      />

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
          <h3 className="font-semibold">Assets</h3>
        </div>
        {currentRelease.assets.length === 0 ? (
          <p className="p-4 text-[#59636e]">No release assets uploaded yet.</p>
        ) : (
          <div className="grid">
            {currentRelease.assets.map((asset) => (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] p-4 last:border-b-0" key={asset.id}>
                <div>
                  <a className="font-semibold text-[#0969da] hover:underline" href={asset.url}>
                    {asset.filename}
                  </a>
                  <p className="text-sm text-[#59636e]">
                    {formatBytes(asset.size)} · {asset.download_count} downloads
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

type ReleaseEditPanelProps = Omit<ReleaseDetailPanelProps, "tags">;

export function ReleaseEditPanel({ baseHref, name, owner, release }: ReleaseEditPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState(release.title);
  const [body, setBody] = useState(release.body);
  const [status, setStatus] = useState<"draft" | "published">(release.status === "published" ? "published" : "draft");
  const [isPrerelease, setIsPrerelease] = useState(release.is_prerelease);
  const [assets, setAssets] = useState<ReleaseAsset[]>(release.assets);
  const uploadUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}/assets`;

  async function updateRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        body,
        is_prerelease: isPrerelease,
        status,
        title,
      }),
    });
    if (!response.ok) {
      setMessage(`Failed to update release: ${response.status}`);
      return;
    }
    router.push(`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`);
    router.refresh();
  }

  async function deleteAsset(assetId: string) {
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}/assets/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to delete asset: ${response.status}`);
      return;
    }
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    router.refresh();
  }

  if (!release.viewer_can_update) {
    return (
      <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-6">
        <h2 className="text-xl font-semibold">You cannot edit this release</h2>
        <p className="text-[#59636e]">Repository write permission is required to edit release notes and assets.</p>
        <Link className="w-fit rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold hover:bg-[#f6f8fa]" href={`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`}>
          Back to release
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <Link className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`}>
        Back to release
      </Link>
      <div className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-4 sm:p-6">
        <div>
          <h2 className="text-2xl font-semibold">Edit release</h2>
          <p className="text-sm text-[#59636e]">{release.tag_name}</p>
        </div>
        <label className="grid gap-1.5">
          Title
          <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            Status
            <select className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value === "published" ? "published" : "draft")}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            Release label
            <select className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" value={isPrerelease ? "pre-release" : "none"} onChange={(event) => setIsPrerelease(event.target.value === "pre-release")}>
              <option value="none">None</option>
              <option value="pre-release">Pre-release</option>
            </select>
          </label>
        </div>
        <MarkdownEditor
          attachments={assets}
          label="Release notes"
          submitLabel="Save release"
          uploadUrl={uploadUrl}
          value={body}
          onAttachmentsChange={(nextAssets: CommentAttachment[]) => setAssets(nextAssets as ReleaseAsset[])}
          onCancel={() => router.push(`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`)}
          onChange={setBody}
          onSubmit={updateRelease}
        />
      </div>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
          <h3 className="font-semibold">Assets</h3>
        </div>
        {assets.length === 0 ? (
          <p className="p-4 text-[#59636e]">No release assets uploaded yet.</p>
        ) : (
          <div className="grid">
            {assets.map((asset) => (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] p-4 last:border-b-0" key={asset.id}>
                <div>
                  <a className="font-semibold text-[#0969da] hover:underline" href={asset.url}>
                    {asset.filename}
                  </a>
                  <p className="text-sm text-[#59636e]">
                    {formatBytes(asset.size)} · {asset.download_count} downloads
                  </p>
                </div>
                <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold" type="button" onClick={() => void deleteAsset(asset.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
    </section>
  );
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold text-[#1f2328]" href={href}>
      {label}
    </Link>
  );
}

function ReleaseBadges({ release }: { release: Release }) {
  const labels = [release.status === "draft" ? "Draft" : "", release.is_prerelease ? "Pre-release" : ""].filter(Boolean);
  return (
    <>
      {labels.map((label) => (
        <span className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 text-xs font-semibold text-[#59636e]" key={label}>
          {label}
        </span>
      ))}
    </>
  );
}

function releaseListHref(baseHref: string, params: { page?: number; q?: string; status: string }) {
  return buildListHref(`${baseHref}/releases`, { page: params.page, q: params.q, status: params.status });
}

function defaultBranch(branches: RepositoryBranch[]) {
  return branches.find((branch) => branch.is_default)?.name ?? branches[0]?.name ?? "";
}

function releaseOwner(release: Release) {
  return {
    avatar_fallback: release.author_handle.slice(0, 2).toUpperCase(),
    avatar_url: null,
    display_name: release.author_display_name || release.author_handle,
    handle: release.author_handle,
    kind: "user",
  };
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, unitSeconds] of units) {
    if (Math.abs(seconds) >= unitSeconds) {
      return formatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return formatter.format(seconds, "second");
}

function firstLine(value: string) {
  return value.split("\n")[0] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
