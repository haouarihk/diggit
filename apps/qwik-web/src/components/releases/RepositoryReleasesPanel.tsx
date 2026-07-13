import { $, component$, type PropFunction, useSignal } from "@builder.io/qwik";
import { Link, useNavigate } from "@builder.io/qwik-city";

import { MarkdownEditor } from "~/components/markdown/MarkdownEditor";
import { MarkdownViewer } from "~/components/markdown/MarkdownViewer";
import { ReactionControls } from "~/components/comments/ReactionControls";
import { OwnerBadge } from "~/components/repositories/RepositoryList";
import { RepoQueryToolbar } from "~/components/repository/RepoQueryToolbar";
import { getAuthToken } from "~/lib/auth-session";
import {
  publicApiBaseUrl,
  type CommentAttachment,
  type CommentReaction,
  type PaginatedCollection,
  type Release,
  type ReleaseAsset,
  type RepositoryBranch,
  type RepositoryTag,
} from "~/lib/api";
import {
  buildListHref,
  parseReleaseSearchQuery,
  toggleReleasePrereleaseQuery,
  toggleReleaseTagQuery,
} from "~/lib/repo-list-query";

type RepositoryReleasesPanelProps = {
  baseHref: string;
  name: string;
  owner: string;
  pagination: PaginatedCollection<Release>["pagination"];
  query: string;
  releases: Release[];
  status: "all" | "draft" | "published";
  tags: RepositoryTag[];
};

const CREATE_NEW_TAG = "__create_new_tag__";

export const RepositoryReleasesPanel = component$(
  ({
    baseHref,
    name,
    owner,
    pagination,
    query,
    releases,
    status,
    tags,
  }: RepositoryReleasesPanelProps) => {
    const searchState = parseReleaseSearchQuery(query);

    return (
      <section class="repository-list-page">
        <RepoQueryToolbar
          description="Publish version notes and downloadable assets from Git tags."
          filterMenu={{
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
                href: releaseListHref(baseHref, {
                  q: toggleReleasePrereleaseQuery(query),
                  status,
                }),
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
              items: tags.map((tag) => ({
                active: searchState.tag?.toLowerCase() === tag.name.toLowerCase(),
                href: releaseListHref(baseHref, {
                  q: toggleReleaseTagQuery(query, tag.name),
                  status,
                }),
                label: tag.name,
              })),
              label: "Tags",
            },
          ]}
          placeholder="Search releases with is:pre-release tag:v1.0.0"
          query={query}
          title="Releases"
          total={pagination.total}
        >
          <Link
            q:slot="action"
            class="repository-list-page__primary-action"
            href={`${baseHref}/releases/new`}
          >
            New release
          </Link>
        </RepoQueryToolbar>

        {releases.length === 0 ? (
          <div class="repository-list-page__empty">
            <h3 class="repository-list-page__empty-title">No releases found</h3>
            <p class="repository-list-page__empty-copy">
              Create a release from an existing Git tag to share changelogs and assets.
            </p>
          </div>
        ) : (
          <ReleaseList
            baseHref={baseHref}
            name={name}
            owner={owner}
            releases={releases}
            tags={tags}
          />
        )}

        {pagination.totalPages > 1 ? (
          <div class="repository-list-page__pagination">
            <span class="repository-list-page__pagination-copy">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div class="repository-list-page__pagination-links">
              {pagination.page > 1 ? (
                <PageLink
                  href={releaseListHref(baseHref, {
                    page: pagination.page - 1,
                    q: query,
                    status,
                  })}
                  label="Previous"
                />
              ) : null}
              {pagination.page < pagination.totalPages ? (
                <PageLink
                  href={releaseListHref(baseHref, {
                    page: pagination.page + 1,
                    q: query,
                    status,
                  })}
                  label="Next"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    );
  },
);

const ReleaseList = component$(
  ({
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
  }) => {
    const releaseItems = useSignal(releases);

    return (
      <div class="repository-list-page__items">
        {releaseItems.value.map((release) => (
          <ReleaseItem
            key={release.id}
            baseHref={baseHref}
            name={name}
            owner={owner}
            onReleaseChange$={$((updated) => {
              releaseItems.value = releaseItems.value.map((entry) =>
                entry.id === updated.id ? updated : entry,
              );
            })}
            release={release}
            tags={tags}
            titleHref={`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`}
          />
        ))}
      </div>
    );
  },
);

export const ReleaseItem = component$(
  ({
    actions,
    baseHref,
    bodyVariant = "summary",
    name,
    owner,
    onReleaseChange$,
    release,
    tags,
    titleHref,
  }: {
    actions?: any;
    baseHref: string;
    bodyVariant?: "markdown" | "summary";
    name: string;
    owner: string;
    onReleaseChange$: PropFunction<(release: Release) => void>;
    release: Release;
    tags: RepositoryTag[];
    titleHref?: string;
  }) => {
    return (
      <article class="release-card">
        <div class="release-card__top">
          <div class="release-card__copy">
            <div class="release-card__title-row">
              {titleHref ? (
                <Link class="release-card__title-link" href={titleHref}>
                  {release.title}
                </Link>
              ) : (
                <h2 class="release-card__title">{release.title}</h2>
              )}
              <ReleaseBadges release={release} />
            </div>
            <div class="release-card__meta">
              {release.last_commit ? (
                <Link
                  class="release-card__commit-link"
                  href={`${baseHref}/commits/${encodeURIComponent(release.last_commit.sha)}`}
                >
                  {firstLine(release.last_commit.message)}
                </Link>
              ) : null}
              <span>•</span>
              <span>{release.tag_name}</span>
              <span>created {relativeTime(release.created_at)}</span>
              <OwnerBadge
                owner={releaseOwner(release)}
                ownerHandle={release.author_handle}
              />
            </div>
          </div>

          <div class="release-card__actions">
            {actions}
            <CompareTagsDropdown baseHref={baseHref} release={release} tags={tags} />
          </div>
        </div>

        {bodyVariant === "markdown" ? (
          <div>
            {release.body || release.body_html ? (
              <MarkdownViewer
                content={release.body}
                sanitizedHtml={release.body_html}
                variant="comment"
              />
            ) : (
              <p class="issue-detail-page__empty-copy">No release notes yet.</p>
            )}
          </div>
        ) : release.body ? (
          <p class="repository-list-card__body">{release.body}</p>
        ) : null}

        <div class="release-card__footer">
          <ReleaseReactions
            name={name}
            owner={owner}
            onReleaseChange$={onReleaseChange$}
            release={release}
          />
          {release.assets.length > 0 ? (
            <p class="issue-detail-page__meta">
              {release.assets.length} asset{release.assets.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </article>
    );
  },
);

const ReleaseReactions = component$(
  ({
    name,
    onReleaseChange$,
    owner,
    release,
  }: {
    name: string;
    onReleaseChange$: PropFunction<(release: Release) => void>;
    owner: string;
    release: Release;
  }) => {
    const isBusy = useSignal(false);

    const toggleReaction = $(async (reaction: CommentReaction) => {
      const token = getAuthToken();
      if (!token) {
        return;
      }

      isBusy.value = true;
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}/reactions`,
        {
          method: reaction.viewer_reacted ? "DELETE" : "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ emoji: reaction.emoji }),
        },
      );
      isBusy.value = false;
      if (!response.ok) {
        return;
      }
      onReleaseChange$((await response.json()) as Release);
    });

    return (
      <ReactionControls
        disabled={isBusy.value}
        onToggle$={toggleReaction}
        reactions={release.reactions}
      />
    );
  },
);

const CompareTagsDropdown = component$(
  ({
    baseHref,
    release,
    tags,
  }: {
    baseHref: string;
    release: Release;
    tags: RepositoryTag[];
  }) => {
    const comparableTags = tags.filter((tag) => tag.name !== release.tag_name);
    if (comparableTags.length === 0) {
      return null;
    }
    return (
      <details class="release-card__compare" data-ui-dropdown="true">
        <summary class="release-card__compare-summary">Compare</summary>
        <div class="release-card__compare-menu">
          {comparableTags.map((tag) => (
            <Link
              key={tag.name}
              class="release-card__compare-link"
              href={`${baseHref}/compare/${encodeURIComponent(tag.name)}...${encodeURIComponent(release.tag_name)}`}
            >
              Compare {tag.name}...{release.tag_name}
            </Link>
          ))}
        </div>
      </details>
    );
  },
);

type ReleaseCreatePanelProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  name: string;
  owner: string;
  tags: RepositoryTag[];
};

export const ReleaseCreatePanel = component$(
  ({ baseHref, branches, name, owner, tags }: ReleaseCreatePanelProps) => {
    const nav = useNavigate();
    const message = useSignal("");
    const selectedTag = useSignal("");

    const createRelease = $(async (_event: SubmitEvent, formElement: HTMLFormElement) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to create releases.";
        return;
      }

      const form = new FormData(formElement);
      const isCreatingTag = selectedTag.value === CREATE_NEW_TAG;
      const tagName = String(
        form.get(isCreatingTag ? "new_tag_name" : "tag_name") ?? "",
      ).trim();
      const releaseLabel = form.get("release_label");
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            body: form.get("body"),
            generate_notes: form.get("generate_notes") === "on",
            is_prerelease: releaseLabel === "pre-release",
            status: form.get("status"),
            tag_name: tagName,
            target_ref: isCreatingTag ? form.get("target_ref") : undefined,
            title: form.get("title"),
          }),
        },
      );

      if (!response.ok) {
        message.value = `Failed to create release: ${response.status}`;
        return;
      }

      const release = (await response.json()) as Release;
      await nav(`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`);
    });

    return (
      <section class="release-form-page">
        <Link class="issue-detail-page__back" href={`${baseHref}/releases`}>
          Back to releases
        </Link>

        <div class="release-form-page__shell">
          <div class="release-form-page__hero">
            <p class="release-form-page__eyebrow">
              {owner}/{name}
            </p>
            <h2 class="release-form-page__title">Create a new release</h2>
            <p class="issue-detail-page__meta">
              Pick an existing tag, or create a new tag from a branch, then publish release notes for users and automation.
            </p>
          </div>

          <form
            class="release-form-page__form"
            onSubmit$={createRelease}
            preventdefault:submit
          >
            <div class="release-form-page__grid">
              <div class="release-form-page__main">
                <div class="release-form-page__section">
                  <div>
                    <h3 class="pull-request-flow__step-title">Release source</h3>
                    <p class="issue-detail-page__meta">
                      Use a tag that already exists, or create one from a target branch.
                    </p>
                  </div>
                  <label class="pull-request-flow__field">
                    Tag
                    <select
                      class="settings-drawer-form__input"
                      name="tag_name"
                      required
                      value={selectedTag.value}
                      onChange$={(_, currentTarget) => {
                        selectedTag.value = currentTarget.value;
                      }}
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

                  {selectedTag.value === CREATE_NEW_TAG ? (
                    <div class="release-form-page__tag-grid">
                      <label class="pull-request-flow__field">
                        New tag name
                        <input
                          class="settings-drawer-form__input"
                          name="new_tag_name"
                          placeholder="v1.0.0"
                          required
                        />
                      </label>
                      <label class="pull-request-flow__field">
                        Target branch
                        <select
                          class="settings-drawer-form__input"
                          name="target_ref"
                          required
                        >
                          {branches.map((branch) => (
                            <option
                              key={branch.name}
                              selected={branch.name === defaultBranch(branches)}
                              value={branch.name}
                            >
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>

                <label class="pull-request-flow__field">
                  Release title
                  <input
                    class="settings-drawer-form__input"
                    name="title"
                    placeholder="Defaults to the tag name"
                  />
                </label>

                <label class="pull-request-flow__field">
                  Release notes
                  <textarea
                    class="settings-drawer-form__textarea"
                    name="body"
                    placeholder="Write markdown release notes..."
                  />
                </label>
              </div>

              <aside class="release-form-page__aside">
                <label class="pull-request-flow__field">
                  Status
                  <select
                    class="settings-drawer-form__input"
                    name="status"
                  >
                    <option selected value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </label>

                <label class="release-form-page__toggle">
                  <input name="generate_notes" type="checkbox" />
                  <span>
                    <strong>Generate release notes</strong>
                    <span>Use commit messages if notes are empty.</span>
                  </span>
                </label>

                <fieldset class="release-form-page__fieldset">
                  <legend class="release-form-page__legend">Release label</legend>
                  <label class="release-form-page__radio">
                    <input defaultChecked name="release_label" type="radio" value="none" />
                    None
                  </label>
                  <label class="release-form-page__radio">
                    <input name="release_label" type="radio" value="pre-release" />
                    Pre-release
                  </label>
                </fieldset>
              </aside>
            </div>

            {message.value ? (
              <p class="release-form-page__message">{message.value}</p>
            ) : null}

            <div class="release-form-page__actions">
              <Link class="settings-resource-panel__secondary-button" href={`${baseHref}/releases`}>
                Cancel
              </Link>
              <button class="settings-resource-panel__primary-button" type="submit">
                Create release
              </button>
            </div>
          </form>
        </div>
      </section>
    );
  },
);

type ReleaseDetailPanelProps = {
  baseHref: string;
  name: string;
  owner: string;
  release: Release;
  tags: RepositoryTag[];
};

export const ReleaseDetailPanel = component$(
  ({ baseHref, name, owner, release, tags }: ReleaseDetailPanelProps) => {
    const currentRelease = useSignal(release);

    return (
      <section class="release-detail-page">
        <Link class="issue-detail-page__back" href={`${baseHref}/releases`}>
          Back to releases
        </Link>

        <ReleaseItem
          actions={
            currentRelease.value.viewer_can_update ? (
              <Link
                class="settings-resource-panel__secondary-button"
                href={`${baseHref}/releases/${encodeURIComponent(currentRelease.value.tag_name)}/edit`}
              >
                Edit release
              </Link>
            ) : null
          }
          baseHref={baseHref}
          bodyVariant="markdown"
          name={name}
          owner={owner}
          onReleaseChange$={$((updated) => {
            currentRelease.value = updated;
          })}
          release={currentRelease.value}
          tags={tags}
        />

        <section class="release-assets">
          <div class="release-assets__header">
            <h3 class="release-assets__title">Assets</h3>
          </div>
          {currentRelease.value.assets.length === 0 ? (
            <p class="release-assets__empty">No release assets uploaded yet.</p>
          ) : (
            <div class="release-assets__list">
              {currentRelease.value.assets.map((asset) => (
                <div class="release-assets__item" key={asset.id}>
                  <div>
                    <a class="release-assets__link" href={asset.url}>
                      {asset.filename}
                    </a>
                    <p class="issue-detail-page__meta">
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
  },
);

type ReleaseEditPanelProps = Omit<ReleaseDetailPanelProps, "tags">;

export const ReleaseEditPanel = component$(
  ({ baseHref, name, owner, release }: ReleaseEditPanelProps) => {
    const nav = useNavigate();
    const message = useSignal("");
    const title = useSignal(release.title);
    const body = useSignal(release.body);
    const status = useSignal<"draft" | "published">(
      release.status === "published" ? "published" : "draft",
    );
    const isPrerelease = useSignal(release.is_prerelease);
    const assets = useSignal<ReleaseAsset[]>(release.assets);
    const uploadUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}/assets`;

    const updateRelease = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to edit releases.";
        return;
      }

      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            body: body.value,
            is_prerelease: isPrerelease.value,
            status: status.value,
            title: title.value,
          }),
        },
      );
      if (!response.ok) {
        message.value = `Failed to update release: ${response.status}`;
        return;
      }
      await nav(`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`);
    });

    const deleteAsset = $(async (assetId: string) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to delete assets.";
        return;
      }

      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/${encodeURIComponent(release.tag_name)}/assets/${encodeURIComponent(assetId)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        message.value = `Failed to delete asset: ${response.status}`;
        return;
      }
      assets.value = assets.value.filter((asset) => asset.id !== assetId);
    });

    if (!release.viewer_can_update) {
      return (
        <section class="release-form-page__shell">
          <h2 class="pull-request-flow__page-title">You cannot edit this release</h2>
          <p class="issue-detail-page__meta">
            Repository write permission is required to edit release notes and assets.
          </p>
          <Link
            class="settings-resource-panel__secondary-button"
            href={`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`}
          >
            Back to release
          </Link>
        </section>
      );
    }

    return (
      <section class="release-detail-page">
        <Link
          class="issue-detail-page__back"
          href={`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`}
        >
          Back to release
        </Link>

        <div class="release-form-page__shell">
          <div>
            <h2 class="release-form-page__title">Edit release</h2>
            <p class="issue-detail-page__meta">{release.tag_name}</p>
          </div>

          <label class="pull-request-flow__field">
            Title
            <input
              class="settings-drawer-form__input"
              value={title.value}
              onInput$={(_, currentTarget) => {
                title.value = currentTarget.value;
              }}
            />
          </label>

          <div class="release-form-page__tag-grid">
            <label class="pull-request-flow__field">
              Status
              <select
                class="settings-drawer-form__input"
                value={status.value}
                onChange$={(_, currentTarget) => {
                  status.value =
                    currentTarget.value === "published" ? "published" : "draft";
                }}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>

            <label class="pull-request-flow__field">
              Release label
              <select
                class="settings-drawer-form__input"
                value={isPrerelease.value ? "pre-release" : "none"}
                onChange$={(_, currentTarget) => {
                  isPrerelease.value = currentTarget.value === "pre-release";
                }}
              >
                <option value="none">None</option>
                <option value="pre-release">Pre-release</option>
              </select>
            </label>
          </div>

          <MarkdownEditor
            attachments={assets.value as unknown as CommentAttachment[]}
            label="Release notes"
            onAttachmentsChange$={$((nextAssets) => {
              assets.value = nextAssets as unknown as ReleaseAsset[];
            })}
            onCancel$={$(() =>
              nav(`${baseHref}/releases/${encodeURIComponent(release.tag_name)}`)
            )}
            onChange$={$((value) => {
              body.value = value;
            })}
            onSubmit$={updateRelease}
            submitLabel="Save release"
            uploadUrl={uploadUrl}
            value={body.value}
          />

          <section class="release-assets">
            <div class="release-assets__header">
              <h3 class="release-assets__title">Assets</h3>
            </div>
            {assets.value.length === 0 ? (
              <p class="release-assets__empty">No release assets uploaded yet.</p>
            ) : (
              <div class="release-assets__list">
                {assets.value.map((asset) => (
                  <div class="release-assets__item" key={asset.id}>
                    <div>
                      <a class="release-assets__link" href={asset.url}>
                        {asset.filename}
                      </a>
                      <p class="issue-detail-page__meta">
                        {formatBytes(asset.size)} · {asset.download_count} downloads
                      </p>
                    </div>
                    <button
                      class="settings-resource-panel__secondary-button"
                      type="button"
                      onClick$={() => deleteAsset(asset.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {message.value ? <p class="issue-detail-page__message">{message.value}</p> : null}
        </div>
      </section>
    );
  },
);

const PageLink = component$(({ href, label }: { href: string; label: string }) => {
  return (
    <Link class="repository-list-page__page-link" href={href}>
      {label}
    </Link>
  );
});

const ReleaseBadges = component$(({ release }: { release: Release }) => {
  const labels = [
    release.status === "draft" ? "Draft" : "",
    release.is_prerelease ? "Pre-release" : "",
  ].filter(Boolean);
  return (
    <>
      {labels.map((label) => (
        <span class="repository-status-badge" key={label}>
          {label}
        </span>
      ))}
    </>
  );
});

function releaseListHref(
  baseHref: string,
  params: { page?: number; q?: string; status: string },
) {
  return buildListHref(`${baseHref}/releases`, {
    page: params.page,
    q: params.q,
    status: params.status,
  });
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
    kind: "user" as const,
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

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
