import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { CopyShaButton } from "~/components/repository/CopyShaButton";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import {
  getRepository,
  listCommits,
  listPullRequests,
  type RepositoryCommit,
} from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

export const useRepositoryCommitsPage = routeLoader$(async ({ params, url }) => {
  const repo = await getRepository(params.owner, params.name);
  const selectedBranch = url.searchParams.get("branch")?.trim() || repo.default_branch;
  const [pullRequests, commits] = await Promise.all([
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
    listCommits(params.owner, params.name, selectedBranch, 0).catch(() => ({
      data: [],
    })),
  ]);

  return {
    baseHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
    commitGroups: groupCommitsByDay(commits.data),
    commitsCount: commits.data.length,
    pullRequestsCount: pullRequests.pagination?.total ?? pullRequests.data.length,
    repo,
    selectedBranch,
  };
});

export default component$(() => {
  const route = useRepositoryCommitsPage();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="code"
        pullRequestsCount={route.value.pullRequestsCount}
        repo={route.value.repo}
      />
      <RepoPageContent>
        <section class="commits-page">
          <header class="commits-page__header">
            <div>
              <h2 class="commits-page__title">
                Commit history for {route.value.selectedBranch}
              </h2>
              <p class="commits-page__description">
                {route.value.commitsCount} commits grouped by date
              </p>
            </div>
            <span class="commits-page__icon" aria-hidden="true">
              ⏱
            </span>
          </header>
          {route.value.commitsCount === 0 ? (
            <p class="commits-page__empty">No commits found.</p>
          ) : (
            <div class="commits-page__groups">
              {route.value.commitGroups.map((group) => (
                <section class="commits-page__group" key={group.key}>
                  <div class="commits-page__group-label">{group.label}</div>
                  {group.commits.map((commit) => (
                    <article class="commits-page__item" key={commit.sha}>
                      <div class="commits-page__item-main">
                        <Link
                          class="commits-page__item-link"
                          href={`${route.value.baseHref}/commits/${commit.sha}`}
                        >
                          {commit.message}
                        </Link>
                        <div class="commits-page__item-meta">
                          <CommitAuthor commit={commit} />
                          <span aria-hidden="true">&middot;</span>
                          <span>{formatTime(commit.created_at)}</span>
                        </div>
                      </div>
                      <div class="commits-page__item-actions">
                        <span class="commits-page__sha" title={commit.sha}>
                          {commit.sha.slice(0, 12)}
                        </span>
                        <CopyShaButton sha={commit.sha} />
                        <Link
                          aria-label="Browse repository at this commit"
                          class="copy-sha-button"
                          href={`${route.value.baseHref}?ref=${encodeURIComponent(commit.sha)}`}
                          title="Browse repository at this commit"
                        >
                          📖
                        </Link>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </section>
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Commit History · Diggit",
};

const CommitAuthor = component$(({ commit }: { commit: RepositoryCommit }) => {
  const avatar = commit.author_avatar_url ? (
    <img
      alt=""
      class="commits-page__avatar"
      height={24}
      src={commit.author_avatar_url}
      width={24}
    />
  ) : (
    <span class="commits-page__avatar commits-page__avatar--fallback">
      {commit.avatar_fallback ?? commit.author_name.slice(0, 2).toUpperCase()}
    </span>
  );
  const label = <span class="commits-page__author-name">{commit.author_name}</span>;

  if (commit.author_username) {
    return (
      <Link
        class="commits-page__author-link"
        href={userProfileHref(commit.author_username)}
      >
        {avatar}
        {label}
      </Link>
    );
  }

  return (
    <span class="commits-page__author-link">
      {avatar}
      {label}
    </span>
  );
});

function groupCommitsByDay(commits: RepositoryCommit[]) {
  const groups = new Map<
    string,
    { key: string; label: string; commits: RepositoryCommit[] }
  >();

  for (const commit of commits) {
    const date = new Date(commit.created_at);
    const key = Number.isNaN(date.getTime())
      ? commit.created_at
      : date.toISOString().slice(0, 10);
    const label = Number.isNaN(date.getTime())
      ? commit.created_at
      : new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(date);
    const group = groups.get(key) ?? { key, label, commits: [] };
    group.commits.push(commit);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(date);
}
