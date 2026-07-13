import { $, component$, useSignal } from "@builder.io/qwik";
import { Link, useNavigate } from "@builder.io/qwik-city";

import { RepoQueryToolbar } from "~/components/repository/RepoQueryToolbar";
import { RepositoryLabelBadges } from "~/components/repository/RepositoryLabelBadges";
import { Drawer } from "~/components/ui/Drawer";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type Issue, type IssueLabel, type PaginatedCollection } from "~/lib/api";
import {
  buildListHref,
  parseIssueSearchQuery,
  setIssueSearchStatusQuery,
  toggleIssueSearchLabelQuery,
} from "~/lib/repo-list-query";

type RepositoryIssuesPanelProps = {
  baseHref: string;
  issues: Issue[];
  labels: IssueLabel[];
  name: string;
  owner: string;
  pagination: PaginatedCollection<Issue>["pagination"];
  query: string;
};

export const RepositoryIssuesPanel = component$(
  ({
    baseHref,
    issues,
    labels,
    name,
    owner,
    pagination,
    query,
  }: RepositoryIssuesPanelProps) => {
    const nav = useNavigate();
    const isCreateOpen = useSignal(false);
    const message = useSignal("");
    const searchState = parseIssueSearchQuery(query);

    const createIssue = $(async (_event: SubmitEvent, formElement: HTMLFormElement) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to create issues.";
        return;
      }

      const form = new FormData(formElement);
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          name,
        )}/issues`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: form.get("title"),
            body: form.get("body"),
            labels: labelList(String(form.get("labels") ?? "")),
          }),
        },
      );

      if (!response.ok) {
        message.value = `Failed to create issue: ${response.status}`;
        return;
      }

      message.value = "Issue created.";
      formElement.reset();
      isCreateOpen.value = false;
      await nav(`${baseHref}/issues`);
    });

    return (
      <section class="repository-list-page">
        <RepoQueryToolbar
          description="Track bugs, ideas, and federated discussion for this repository."
          filterMenu={{
            items: [
              {
                active: searchState.status === "open",
                description: "Show only open issues",
                href: issueListHref(baseHref, {
                  q: setIssueSearchStatusQuery(query, "open"),
                }),
                label: "Open",
              },
              {
                active: searchState.status === "closed",
                description: "Show only closed issues",
                href: issueListHref(baseHref, {
                  q: setIssueSearchStatusQuery(query, "closed"),
                }),
                label: "Closed",
              },
              {
                active: searchState.status === null,
                description: "Show issues across every status",
                href: issueListHref(baseHref, {
                  q: setIssueSearchStatusQuery(query, null),
                }),
                label: "All",
              },
            ],
            label: "Filters",
          }}
          formAction={`${baseHref}/issues`}
          menus={[
            {
              count: labels.length,
              emptyLabel: "No labels created yet.",
              items: labels.map((label) => ({
                active: searchState.labels.some(
                  (selectedLabel) =>
                    selectedLabel.toLowerCase() === label.name.toLowerCase(),
                ),
                color: label.color,
                href: issueListHref(baseHref, {
                  q: toggleIssueSearchLabelQuery(query, label.name),
                }),
                label: label.name,
              })),
              label: "Labels",
            },
          ]}
          placeholder={'Search issues with is:open label:"bug"'}
          query={query}
          title="Issues"
          total={pagination.total}
        >
          <button
            q:slot="action"
            class="repository-list-page__primary-action"
            type="button"
            onClick$={() => {
              isCreateOpen.value = true;
            }}
          >
            New issue
          </button>
        </RepoQueryToolbar>

        {message.value ? (
          <div class="repository-list-page__message">{message.value}</div>
        ) : null}

        {issues.length === 0 ? (
          <div class="repository-list-page__empty">
            <h3 class="repository-list-page__empty-title">No issues found</h3>
            <p class="repository-list-page__empty-copy">
              Create an issue to start tracking work or discussion.
            </p>
          </div>
        ) : (
          <div class="repository-list-page__items">
            {issues.map((issue) => (
              <article class="repository-list-card" key={issue.id}>
                <div class="repository-list-card__header">
                  <Link
                    class="repository-list-card__title"
                    href={`${baseHref}/issues/${issue.number}`}
                  >
                    {issue.title}
                  </Link>
                  <IssueStatus status={issue.status} />
                </div>
                <p class="repository-list-card__meta">
                  #{issue.number} opened by{" "}
                  {issue.author_display_name || issue.author_handle}{" "}
                  {formatDate(issue.created_at)}
                </p>
                <RepositoryLabelBadges labels={issue.labels} />
                {issue.body ? (
                  <p class="repository-list-card__body">{issue.body}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 ? (
          <div class="repository-list-page__pagination">
            <span class="repository-list-page__pagination-copy">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div class="repository-list-page__pagination-links">
              {pagination.page > 1 ? (
                <PageLink
                  href={issueListHref(baseHref, {
                    page: pagination.page - 1,
                    q: query,
                  })}
                  label="Previous"
                />
              ) : null}
              {pagination.page < pagination.totalPages ? (
                <PageLink
                  href={issueListHref(baseHref, {
                    page: pagination.page + 1,
                    q: query,
                  })}
                  label="Next"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <Drawer
          isOpen={isCreateOpen.value}
          onClose$={$(() => {
            isCreateOpen.value = false;
          })}
          subtitle={`${owner}/${name}`}
          title="New issue"
        >
          <form
            class="settings-drawer-form"
            onSubmit$={createIssue}
            preventdefault:submit
          >
            <label class="settings-drawer-form__label">
              Title
              <input class="settings-drawer-form__input" name="title" required />
            </label>
            <label class="settings-drawer-form__label">
              Body
              <textarea class="settings-drawer-form__textarea" name="body" />
            </label>
            <label class="settings-drawer-form__label">
              Tags
              <input
                class="settings-drawer-form__input"
                name="labels"
                placeholder="bug, enhancement"
              />
            </label>
            <div class="settings-drawer-form__actions">
              <button
                class="settings-resource-panel__secondary-button"
                type="button"
                onClick$={() => {
                  isCreateOpen.value = false;
                }}
              >
                Cancel
              </button>
              <button class="settings-resource-panel__primary-button" type="submit">
                Create issue
              </button>
            </div>
          </form>
        </Drawer>
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

const IssueStatus = component$(({ status }: { status: Issue["status"] }) => {
  return <span class="repository-status-badge">{status}</span>;
});

function issueListHref(baseHref: string, params: { page?: number; q?: string }) {
  return buildListHref(`${baseHref}/issues`, { page: params.page, q: params.q });
}

function labelList(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
