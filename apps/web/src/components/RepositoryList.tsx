import Link from "next/link";
import { repoHref, type Repository } from "@/lib/api";
import { StarButton } from "@/components/StarButton";

type RepositoryListProps = {
  repositories: Repository[];
  emptyLabel: string;
};

export function RepositoryList({ repositories, emptyLabel }: RepositoryListProps) {
  if (repositories.length === 0) {
    return (
      <div className="rounded-md border border-[#d0d7de] bg-white p-4">
        <p className="text-[#59636e]">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="grid">
        {repositories.map((repo) => (
          <article className="grid gap-3 border-b border-[#d8dee4] p-4 last:border-b-0" key={repo.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1.5">
                <OwnerBadge owner={repo.owner} ownerHandle={repo.owner_handle} />
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="text-base font-bold text-[#0969da] hover:underline" href={repoHref(repo)}>
                    {repo.owner_handle}/{repo.name}
                  </Link>
                  <span className="rounded-full border border-[#d0d7de] px-2 py-0.5 text-xs font-semibold text-[#59636e]">
                    {repo.visibility}
                  </span>
                </div>
                <p className="text-[#59636e]">{repo.description || "No description provided."}</p>
              </div>
              <StarButton
                initialStarred={repo.viewer_has_starred}
                initialStars={repo.stars_count}
                name={repo.name}
                owner={repo.owner_handle}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
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
}

export function OwnerBadge({ owner, ownerHandle, withoutHandle }: { owner: Repository["owner"]; ownerHandle: string; withoutHandle?: boolean }) {
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
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-6 w-6 rounded-full bg-[#d0d7de]" src={safeOwner.avatar_url} />
      ) : (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d0d7de] text-xs font-bold text-[#24292f]">
          {safeOwner.avatar_fallback}
        </span>
      )}
      <span className="font-medium text-[#1f2328]">{safeOwner.display_name}</span>
      {!withoutHandle ? <span className="text-[#59636e]">@{safeOwner.handle}</span> : null}
    </>
  );

  if (!href) {
    return <div className="flex flex-wrap items-center gap-2 text-sm">{content}</div>;
  }

  return (
    <Link className="flex flex-wrap items-center gap-2 text-sm hover:underline" href={href}>
      {content}
    </Link>
  );
}

function ownerHref(owner: Repository["owner"]) {
  if (!owner) {
    return null;
  }

  if (owner.kind === "organization") {
    return `/organizations/${encodeURIComponent(owner.handle)}`;
  }
  if (owner.kind === "user") {
    return `/users/${encodeURIComponent(owner.handle)}`;
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
