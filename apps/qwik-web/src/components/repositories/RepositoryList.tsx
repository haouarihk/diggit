import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { StarButton } from "~/components/repositories/StarButton";
import { repoHref, type Repository } from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

type RepositoryListProps = {
  repositories: Repository[];
  emptyLabel: string;
};

export const RepositoryList = component$(
  ({ repositories = [], emptyLabel = "" }: Partial<RepositoryListProps>) => {
    if (repositories.length === 0) {
      return (
        <div class="repo-empty-state">
          <p class="repo-empty-state__text">{emptyLabel}</p>
        </div>
      );
    }

    return (
      <section class="repo-list">
        <div class="repo-list__items">
          {repositories.map((repo) => (
            <article class="repo-card" key={repo.id}>
              <div class="repo-card__header">
                <div class="repo-card__details">
                  <OwnerBadge owner={repo.owner} ownerHandle={repo.owner_handle} />
                  <div class="repo-card__title-row">
                    <Link class="repo-card__link" href={repoHref(repo)}>
                      {repo.owner_handle}/{repo.name}
                    </Link>
                    <span class="repo-card__visibility">{repo.visibility}</span>
                  </div>
                  <p class="repo-card__description">
                    {repo.description || "No description provided."}
                  </p>
                </div>
                <StarButton
                  initialStarred={repo.viewer_has_starred}
                  initialStars={repo.stars_count}
                  name={repo.name}
                  owner={repo.owner_handle}
                />
              </div>

              <div class="repo-card__meta">
                <span>{repo.dominant_language || "Unknown"}</span>
                <span>Updated {formatDate(repo.updated_at)}</span>
                {repo.remote_server ? <span>{repo.remote_server}</span> : null}
                {repo.source_repository_id ? <span>fork</span> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  },
);

export const OwnerBadge = component$(
  ({
    owner,
    ownerHandle,
    withoutHandle,
  }: {
    owner: Repository["owner"];
    ownerHandle: string;
    withoutHandle?: boolean;
  }) => {
    const safeOwner = owner ?? {
      avatar_fallback: ownerHandle.slice(0, 2).toUpperCase(),
      avatar_url: null,
      display_name: ownerHandle,
      handle: ownerHandle,
      kind: "user",
    };
    const href = ownerHref(owner);
    const content = (
      <>
        {safeOwner.avatar_url ? (
          <img
            alt=""
            class="owner-badge__avatar"
            height={24}
            src={safeOwner.avatar_url}
            width={24}
          />
        ) : (
          <span class="owner-badge__avatar owner-badge__avatar--fallback">
            {safeOwner.avatar_fallback}
          </span>
        )}
        <span class="owner-badge__name">{safeOwner.display_name}</span>
        {!withoutHandle ? (
          <span class="owner-badge__handle">@{safeOwner.handle}</span>
        ) : null}
      </>
    );

    if (!href) {
      return <div class="owner-badge">{content}</div>;
    }

    return (
      <Link class="owner-badge owner-badge--link" href={href}>
        {content}
      </Link>
    );
  },
);

function ownerHref(owner: Repository["owner"]) {
  if (!owner) {
    return null;
  }

  if (owner.kind === "organization") {
    return `/organizations/${encodeURIComponent(owner.handle)}`;
  }
  if (owner.kind === "user") {
    return userProfileHref(owner.handle);
  }

  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
