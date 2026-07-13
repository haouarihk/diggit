import { Slot, component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { CurrentUserNavActions } from "~/components/navigation/NavActions";
import { ForkButton } from "~/components/repository/ForkButton";
import { StarButton } from "~/components/repositories/StarButton";
import { type Repository } from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

type RepoHeaderProps = {
  activeTab:
    | "actions"
    | "code"
    | "issues"
    | "pull-requests"
    | "releases"
    | "settings";
  issuesCount?: number;
  pullRequestsCount?: number;
  releasesCount?: number;
  repo: Repository;
};

export const RepoHeader = component$(
  ({
    activeTab,
    issuesCount = 0,
    pullRequestsCount = 0,
    releasesCount = 0,
    repo,
  }: RepoHeaderProps) => {
    const ownerHandle = repo.owner?.handle ?? repo.owner_handle;
    const ownerHref =
      repo.owner?.kind === "organization"
        ? `/organizations/${encodeURIComponent(ownerHandle)}`
        : userProfileHref(ownerHandle);
    const baseHref = `/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(
      repo.name,
    )}`;
    const repoHref = `${baseHref}/`;

    return (
      <section class="repo-header">
        <div class="repo-header__top">
          <div class="repo-header__title-wrap">
            <div class="repo-header__title">
              <Link class="repo-header__owner" href={ownerHref}>
                {ownerHandle}
              </Link>
              <span class="repo-header__separator">/</span>
              <Link class="repo-header__name" href={repoHref}>
                {repo.name}
              </Link>
              <span class="repo-header__visibility">{repo.visibility}</span>
            </div>
          </div>

          <div class="repo-header__actions">
            <div class="repo-header__repo-actions">
              <ForkButton
                initialForks={repo.forks_count ?? 0}
                name={repo.name}
                owner={repo.owner_handle}
              />
              <StarButton
                initialStarred={repo.viewer_has_starred}
                initialStars={repo.stars_count}
                name={repo.name}
                owner={repo.owner_handle}
              />
            </div>
            <CurrentUserNavActions class="repo-header__nav-actions" />
          </div>
        </div>

        <nav aria-label="Repository" class="repo-tabs">
          <Link
            class={[
              "repo-tabs__tab",
              activeTab === "code" ? "repo-tabs__tab--active" : "",
            ]}
            href={repoHref}
          >
            Code
          </Link>
          {repo.issues_enabled ? (
            <Link
              class={[
                "repo-tabs__tab",
                activeTab === "issues" ? "repo-tabs__tab--active" : "",
              ]}
              href={`${baseHref}/issues/`}
            >
              Issues
              <span class="repo-tabs__count">{issuesCount}</span>
            </Link>
          ) : null}
          {repo.pull_requests_enabled ? (
            <Link
              class={[
                "repo-tabs__tab",
                activeTab === "pull-requests" ? "repo-tabs__tab--active" : "",
              ]}
              href={`${baseHref}/pull-requests/`}
            >
              Pull requests
              <span class="repo-tabs__count">{pullRequestsCount}</span>
            </Link>
          ) : null}
          <Link
            class={[
              "repo-tabs__tab",
              activeTab === "releases" ? "repo-tabs__tab--active" : "",
            ]}
            href={`${baseHref}/releases/`}
          >
            Releases
            <span class="repo-tabs__count">{releasesCount}</span>
          </Link>
          <Link
            class={[
              "repo-tabs__tab",
              activeTab === "actions" ? "repo-tabs__tab--active" : "",
            ]}
            href={`${baseHref}/actions/`}
          >
            Actions
          </Link>
          <Link
            class={[
              "repo-tabs__tab",
              activeTab === "settings" ? "repo-tabs__tab--active" : "",
            ]}
            href={`${baseHref}/settings/`}
          >
            Settings
          </Link>
        </nav>
      </section>
    );
  },
);

export const RepoPageContent = component$(() => {
  return (
    <div class="repo-page-shell">
      <Slot />
    </div>
  );
});
