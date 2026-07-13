import { Slot, component$ } from "@builder.io/qwik";
import { ForkButton } from "~/components/repository/ForkButton";
import { StarButton } from "~/components/repositories/StarButton";
import { type Repository } from "~/lib/api";

type RepoHeaderProps = {
  activeTab: "code";
  pullRequestsCount?: number;
  repo: Repository;
};

export const RepoHeader = component$(({ pullRequestsCount = 0, repo }: RepoHeaderProps) => {
  return (
    <section class="repo-header">
      <div class="repo-header__top">
        <div class="repo-header__title-wrap">
          <div class="repo-header__title">
            <span class="repo-header__owner">{repo.owner?.handle ?? repo.owner_handle}</span>
            <span class="repo-header__separator">/</span>
            <span class="repo-header__name">{repo.name}</span>
            <span class="repo-header__visibility">{repo.visibility}</span>
          </div>
        </div>

        <div class="repo-header__actions">
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
      </div>

      <nav aria-label="Repository" class="repo-tabs">
        <span class="repo-tabs__tab repo-tabs__tab--active">Code</span>
        {repo.issues_enabled ? (
          <span class="repo-tabs__tab repo-tabs__tab--disabled">Issues</span>
        ) : null}
        {repo.pull_requests_enabled ? (
          <span class="repo-tabs__tab repo-tabs__tab--disabled">
            Pull requests
            <span class="repo-tabs__count">{pullRequestsCount}</span>
          </span>
        ) : null}
        <span class="repo-tabs__tab repo-tabs__tab--disabled">Releases</span>
        <span class="repo-tabs__tab repo-tabs__tab--disabled">Actions</span>
        <span class="repo-tabs__tab repo-tabs__tab--disabled">Settings</span>
      </nav>
    </section>
  );
});

export const RepoPageContent = component$(() => {
  return (
    <div class="repo-page-shell">
      <Slot />
    </div>
  );
});
