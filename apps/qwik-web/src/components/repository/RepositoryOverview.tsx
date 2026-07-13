import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import {
  type Repository,
  type RepositoryBranch,
  type RepositoryContributor,
  type RepositoryFile,
  type RepositoryLanguage,
  type RepositoryStats,
  type RepositoryTag,
  type RepositoryTree,
} from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

type RepositoryOverviewProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  contributors: RepositoryContributor[];
  languages: RepositoryLanguage[];
  pullRequestsCount: number;
  query: string;
  readme: RepositoryFile | null;
  repo: Repository;
  selectedRef: string;
  stats: RepositoryStats;
  tags: RepositoryTag[];
  tree: RepositoryTree;
};

export const RepositoryOverview = component$((props: RepositoryOverviewProps) => {
  const filteredEntries = props.query
    ? props.tree.entries.filter((entry) =>
        entry.path.toLowerCase().includes(props.query.toLowerCase()),
      )
    : props.tree.entries;

  return (
    <div class="repository-page">
      <div class="repository-page__main">
        <RepositoryCodeToolbar
          baseHref={props.baseHref}
          branches={props.branches}
          query={props.query}
          repo={props.repo}
          selectedRef={props.selectedRef}
          tags={props.tags}
        />

        <section>
          <div class="repository-list-header">
            <div class="repository-list-header__content">
              <div class="repository-list-header__owner">
                {props.repo.owner?.display_name ?? props.repo.owner_handle}
              </div>
              <div class="repository-list-header__message">
                {props.tree.last_commit
                  ? props.tree.last_commit.message
                  : "Push code to populate this repository."}
              </div>
            </div>
            {props.tree.last_commit?.created_at ? (
              <span class="repository-list-header__time">
                {relativeTime(props.tree.last_commit.created_at)}
              </span>
            ) : null}
          </div>

          <RepositoryFileTable
            baseHref={props.baseHref}
            entries={filteredEntries}
            selectedRef={props.selectedRef}
          />
          <RepositoryReadme readme={props.readme} />
        </section>
      </div>

      <aside class="repository-page__sidebar">
        <RepositoryAboutCard
          pullRequestsCount={props.pullRequestsCount}
          repo={props.repo}
          stats={props.stats}
        />
        <RepositoryContributorsCard contributors={props.contributors} />
        <RepositoryLanguagesCard languages={props.languages} />
      </aside>
    </div>
  );
});

const RepositoryCodeToolbar = component$(
  ({
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
  }) => {
    return (
      <div class="repository-toolbar">
        <div class="repository-toolbar__left">
          <details class="repository-ref-switcher" data-ui-dropdown="true">
            <summary class="repository-ref-switcher__summary">
              <span class="repository-ref-switcher__icon">⎇</span>
              <span class="repository-ref-switcher__label">{selectedRef}</span>
            </summary>
            <div class="repository-ref-switcher__panel">
              <div class="repository-ref-switcher__section">
                <div class="repository-ref-switcher__heading">Branches</div>
                {branches.length > 0 ? (
                  branches.map((branch) => (
                    <Link
                      class={[
                        "repository-ref-switcher__link",
                        branch.name === selectedRef
                          ? "repository-ref-switcher__link--active"
                          : "",
                      ]}
                      href={refHref(baseHref, branch.name)}
                      key={branch.name}
                    >
                      <span>{branch.name}</span>
                      {branch.is_default ? (
                        <span class="repository-ref-switcher__badge">Default</span>
                      ) : null}
                    </Link>
                  ))
                ) : (
                  <div class="repository-ref-switcher__empty">No branches found.</div>
                )}
              </div>
              <div class="repository-ref-switcher__section">
                <div class="repository-ref-switcher__heading">Tags</div>
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <Link
                      class={[
                        "repository-ref-switcher__link",
                        tag.name === selectedRef
                          ? "repository-ref-switcher__link--active"
                          : "",
                      ]}
                      href={refHref(baseHref, tag.name)}
                      key={tag.name}
                    >
                      <span>{tag.name}</span>
                    </Link>
                  ))
                ) : (
                  <div class="repository-ref-switcher__empty">No tags found.</div>
                )}
              </div>
            </div>
          </details>
        </div>

        <div class="repository-toolbar__right">
          <form action={baseHref} class="repository-toolbar__search">
            <input name="ref" type="hidden" value={selectedRef} />
            <input
              class="repository-toolbar__search-input"
              defaultValue={query}
              name="q"
              placeholder="Find file"
              type="search"
            />
          </form>
          <Link
            class="repository-focused-header__button"
            href={codeHref(baseHref, undefined, selectedRef, "tree")}
          >
            Browse files
          </Link>
          <details class="repository-clone" data-ui-dropdown="true">
            <summary class="repository-clone__summary">Code</summary>
            <div class="repository-clone__panel">
              <CloneUrl
                label="SSH"
                value={cloneCommand(repo.ssh_url, selectedRef, repo.default_branch)}
              />
              <CloneUrl
                label="HTTP"
                value={cloneCommand(repo.http_url, selectedRef, repo.default_branch)}
              />
            </div>
          </details>
        </div>
      </div>
    );
  },
);

const RepositoryFileTable = component$(
  ({
    baseHref,
    entries,
    selectedRef,
  }: {
    baseHref: string;
    entries: RepositoryTree["entries"];
    selectedRef: string;
  }) => {
    if (entries.length === 0) {
      return <div class="repository-file-table__empty">No files found.</div>;
    }

    return (
      <div class="repository-file-table">
        {entries.map((entry) => (
          <div class="repository-file-row" key={entry.path}>
            <div class="repository-file-row__name">
              <span class="repository-file-row__icon">
                {entry.kind === "directory" ? "📁" : "📄"}
              </span>
              <Link
                class="repository-file-row__label"
                href={codeHref(
                  baseHref,
                  entry.path,
                  selectedRef,
                  entry.kind === "directory" ? "tree" : "blob",
                )}
              >
                {entry.name}
              </Link>
            </div>
            <div class="repository-file-row__message">
              {entry.last_commit ? entry.last_commit.message : "No commit message"}
            </div>
            <div class="repository-file-row__time">
              {entry.last_commit?.created_at
                ? relativeTime(entry.last_commit.created_at)
                : "Never"}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

const RepositoryReadme = component$(({ readme }: { readme: RepositoryFile | null }) => {
  if (!readme) {
    return null;
  }

  return (
    <section class="repository-readme">
      <div class="repository-readme__header">README.md</div>
      <pre class="repository-readme__content">{readme.content}</pre>
    </section>
  );
});

const RepositoryAboutCard = component$(
  ({
    pullRequestsCount,
    repo,
    stats,
  }: {
    pullRequestsCount: number;
    repo: Repository;
    stats: RepositoryStats;
  }) => {
    return (
      <section class="repository-sidebar-card">
        <h2 class="repository-sidebar-card__title">About</h2>
        <p class="repository-sidebar-card__text">
          {repo.description || "No description provided."}
        </p>
        <div class="repository-facts">
          <RepoFact label="Commits" value={formatCount(stats.commits_count)} />
          <RepoFact label="Branches" value={formatCount(stats.branches_count)} />
          <RepoFact label="Tags" value={formatCount(stats.tags_count)} />
          <RepoFact label="Releases" value={formatCount(stats.releases_count)} />
          {repo.pull_requests_enabled ? (
            <RepoFact
              label="Pull requests"
              value={formatCount(pullRequestsCount)}
            />
          ) : null}
          {repo.source_repository_id || repo.source_remote_url ? (
            <RepoFact label="Type" value="Fork" />
          ) : null}
        </div>
      </section>
    );
  },
);

const RepoFact = component$(({ label, value }: { label: string; value: string }) => {
  return (
    <div class="repository-fact">
      <span class="repository-fact__label">{label}</span>
      <span class="repository-fact__value">{value}</span>
    </div>
  );
});

const RepositoryContributorsCard = component$(
  ({ contributors }: { contributors: RepositoryContributor[] }) => {
    return (
      <section class="repository-sidebar-card">
        <h2 class="repository-sidebar-card__title">Contributors</h2>
        {contributors.length > 0 ? (
          <div class="repository-contributors">
            {contributors.slice(0, 5).map((contributor) => (
              <ContributorListItem
                contributor={contributor}
                key={contributor.username ?? contributor.name}
              />
            ))}
          </div>
        ) : (
          <p class="repository-sidebar-card__text">No contributors yet.</p>
        )}
      </section>
    );
  },
);

const ContributorListItem = component$(
  ({ contributor }: { contributor: RepositoryContributor }) => {
    const content = (
      <>
        {contributor.avatar_url ? (
          <img
            alt=""
            class="repository-contributor__avatar"
            height={32}
            src={contributor.avatar_url}
            width={32}
          />
        ) : (
          <span class="repository-contributor__avatar repository-contributor__avatar--fallback">
            {contributor.avatar_fallback}
          </span>
        )}
        <span class="repository-contributor__name">{contributor.name}</span>
        <span class="repository-contributor__commits">{contributor.commits}</span>
      </>
    );

    if (!contributor.username) {
      return <div class="repository-contributor">{content}</div>;
    }

    return (
      <Link
        class="repository-contributor repository-contributor--link"
        href={userProfileHref(contributor.username)}
      >
        {content}
      </Link>
    );
  },
);

const RepositoryLanguagesCard = component$(
  ({ languages }: { languages: RepositoryLanguage[] }) => {
    return (
      <section class="repository-sidebar-card">
        <h2 class="repository-sidebar-card__title">Languages</h2>
        {languages.length > 0 ? (
          <>
            <div
              class="repository-languages__chart"
              style={{ background: languageGradient(languages) }}
            />
            <div class="repository-languages__list">
              {languages.map((language) => (
                <div class="repository-language" key={language.language}>
                  <span class="repository-language__name">
                    <span
                      class="repository-language__dot"
                      style={{ backgroundColor: language.color }}
                    />
                    <span>{language.language}</span>
                  </span>
                  <span class="repository-language__percent">
                    {formatPercentage(language.percentage)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p class="repository-sidebar-card__text">No language data yet.</p>
        )}
      </section>
    );
  },
);

const CloneUrl = component$(({ label, value }: { label: string; value: string }) => {
  return (
    <div class="repository-clone__item">
      <span class="repository-clone__label">{label}</span>
      <div class="repository-clone__value">{value}</div>
    </div>
  );
});

function refHref(baseHref: string, ref: string) {
  const query = new URLSearchParams({ ref });
  return `${baseHref}?${query.toString()}`;
}

function codeHref(
  baseHref: string,
  path: string | undefined,
  ref: string,
  mode: "blob" | "tree",
) {
  const query = new URLSearchParams({ ref });
  return path
    ? `${baseHref}/${mode}/${path.split("/").map(encodeURIComponent).join("/")}?${query}`
    : `${baseHref}/tree?${query}`;
}

function cloneCommand(url: string, ref: string, defaultBranch: string) {
  return ref !== defaultBranch
    ? `git clone --branch ${shellArg(ref)} ${shellArg(url)}`
    : `git clone ${shellArg(url)}`;
}

function shellArg(value: string) {
  return /^[A-Za-z0-9_./:@-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercentage(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function languageGradient(languages: RepositoryLanguage[]) {
  let cursor = 0;
  const segments = languages.map((language, index) => {
    const start = cursor;
    const end =
      index === languages.length - 1
        ? 100
        : Math.min(100, cursor + language.percentage);
    cursor = end;
    return `${language.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function relativeTime(value: string) {
  const deltaMs = new Date(value).getTime() - Date.now();
  const absMs = Math.abs(deltaMs);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];

  for (const [unit, ms] of units) {
    if (absMs >= ms) {
      return formatter.format(Math.round(deltaMs / ms), unit);
    }
  }

  return formatter.format(Math.round(deltaMs / 1000), "second");
}
