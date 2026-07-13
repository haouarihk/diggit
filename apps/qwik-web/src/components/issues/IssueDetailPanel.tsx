import { $, component$, useSignal } from "@builder.io/qwik";

import { ConversationPanel } from "~/components/comments/ConversationPanel";
import { MarkdownViewer } from "~/components/markdown/MarkdownViewer";
import { RepositoryLabelBadges } from "~/components/repository/RepositoryLabelBadges";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type ActivityItem, type Issue } from "~/lib/api";

type IssueDetailPanelProps = {
  activity: ActivityItem[];
  baseHref: string;
  issue: Issue;
  name: string;
  owner: string;
};

export const IssueDetailPanel = component$(
  ({ activity, baseHref, issue: initialIssue, name, owner }: IssueDetailPanelProps) => {
    const issue = useSignal(initialIssue);
    const message = useSignal("");
    const commentsUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.value.number}/comments`;
    const activityUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.value.number}/activity`;
    const attachmentUploadUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/comment-attachments`;

    const setIssueStatus = $(async (nextStatus: "open" | "closed") => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update issues.";
        return;
      }

      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${issue.value.number}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      if (!response.ok) {
        message.value = `Failed to update issue: ${response.status}`;
        return;
      }

      issue.value = (await response.json()) as Issue;
      message.value = `Issue ${nextStatus}.`;
    });

    return (
      <main class="issue-detail-page">
        <a class="issue-detail-page__back" href={`${baseHref}/issues`}>
          Back to issues
        </a>

        <section class="issue-detail-page__hero">
          <div class="issue-detail-page__hero-top">
            <div>
              <h1 class="issue-detail-page__title">
                {issue.value.title}{" "}
                <span class="issue-detail-page__number">#{issue.value.number}</span>
              </h1>
              <p class="issue-detail-page__meta">
                Opened by {issue.value.author_display_name || issue.value.author_handle}{" "}
                {formatDate(issue.value.created_at)}
              </p>
            </div>
            <button
              class="issue-detail-page__status-action"
              type="button"
              onClick$={() =>
                setIssueStatus(issue.value.status === "open" ? "closed" : "open")
              }
            >
              {issue.value.status === "open" ? "Close issue" : "Reopen issue"}
            </button>
          </div>

          <RepositoryLabelBadges labels={issue.value.labels} />
          {issue.value.body ? (
            <MarkdownViewer content={issue.value.body} variant="comment" />
          ) : (
            <p class="issue-detail-page__empty-copy">No description provided.</p>
          )}
        </section>

        {message.value ? <p class="issue-detail-page__message">{message.value}</p> : null}

        <ConversationPanel
          activity={activity}
          activityUrl={activityUrl}
          attachmentUploadUrl={attachmentUploadUrl}
          commentsUrl={commentsUrl}
        />
      </main>
    );
  },
);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
