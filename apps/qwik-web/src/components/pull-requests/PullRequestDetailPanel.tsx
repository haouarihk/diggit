import { $, component$, useSignal } from "@builder.io/qwik";

import { ConversationPanel } from "~/components/comments/ConversationPanel";
import { MarkdownViewer } from "~/components/markdown/MarkdownViewer";
import { RepositoryLabelBadges } from "~/components/repository/RepositoryLabelBadges";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type ActivityItem, type PullRequest } from "~/lib/api";

type PullRequestDetailPanelProps = {
  activity: ActivityItem[];
  baseHref: string;
  name: string;
  owner: string;
  pullRequest: PullRequest;
};

export const PullRequestDetailPanel = component$(
  ({
    activity,
    baseHref,
    name,
    owner,
    pullRequest: initialPullRequest,
  }: PullRequestDetailPanelProps) => {
    const pullRequest = useSignal(initialPullRequest);
    const labelInput = useSignal(joinLabels(initialPullRequest.labels));
    const message = useSignal("");
    const isBusy = useSignal(false);

    const commentsUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.value.id))}/comments`;
    const activityUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${encodeURIComponent(String(pullRequest.value.id))}/activity`;
    const attachmentUploadUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/comment-attachments`;

    const updateStatus = $(async (status: "open" | "closed") => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update pull requests.";
        return;
      }

      isBusy.value = true;
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.value.id))}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        },
      );
      isBusy.value = false;

      if (!response.ok) {
        message.value = `Failed to update pull request: ${response.status}`;
        return;
      }

      const nextPullRequest = (await response.json()) as PullRequest;
      pullRequest.value = nextPullRequest;
      labelInput.value = joinLabels(nextPullRequest.labels);
      message.value = status === "closed" ? "Pull request closed." : "Pull request reopened.";
    });

    const mergePullRequest = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to merge pull requests.";
        return;
      }

      isBusy.value = true;
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.value.id))}/merge`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      isBusy.value = false;

      if (!response.ok) {
        message.value = `Merge failed: ${response.status}`;
        return;
      }

      const nextPullRequest = (await response.json()) as PullRequest;
      pullRequest.value = nextPullRequest;
      labelInput.value = joinLabels(nextPullRequest.labels);
      message.value = "Pull request merged.";
    });

    const saveLabels = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update labels.";
        return;
      }

      isBusy.value = true;
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.value.id))}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ labels: labelList(labelInput.value) }),
        },
      );
      isBusy.value = false;

      if (!response.ok) {
        message.value = `Failed to update labels: ${response.status}`;
        return;
      }

      const nextPullRequest = (await response.json()) as PullRequest;
      pullRequest.value = nextPullRequest;
      labelInput.value = joinLabels(nextPullRequest.labels);
      message.value = "Pull request labels updated.";
    });

    return (
      <main class="pull-request-detail-page">
        <a class="issue-detail-page__back" href={`${baseHref}/pull-requests`}>
          Back to pull requests
        </a>

        <section class="pull-request-detail-page__hero">
          <div class="pull-request-detail-page__hero-top">
            <div class="pull-request-detail-page__hero-copy">
              <div class="pull-request-detail-page__hero-meta">
                <PullRequestStatus status={pullRequest.value.status} />
                <span class="issue-detail-page__meta">
                  Opened {formatDate(pullRequest.value.created_at)}
                </span>
              </div>
              <h1 class="pull-request-detail-page__title">{pullRequest.value.title}</h1>
              <p class="pull-request-detail-page__branches">
                {pullRequest.value.author_handle} wants to merge{" "}
                <BranchBadge label={pullRequest.value.source_branch} /> into{" "}
                <BranchBadge label={pullRequest.value.target_branch} />
              </p>
              <RepositoryLabelBadges labels={pullRequest.value.labels} />
            </div>

            {pullRequest.value.viewer_can_update ? (
              <div class="pull-request-detail-page__hero-actions">
                {pullRequest.value.status === "open" ? (
                  <>
                    <button
                      class="settings-resource-panel__primary-button"
                      disabled={isBusy.value}
                      type="button"
                      onClick$={mergePullRequest}
                    >
                      {isBusy.value ? "Working..." : "Merge pull request"}
                    </button>
                    <button
                      class="conversation-panel__danger-button"
                      disabled={isBusy.value}
                      type="button"
                      onClick$={() => updateStatus("closed")}
                    >
                      Close
                    </button>
                  </>
                ) : null}
                {pullRequest.value.status === "closed" ? (
                  <button
                    class="settings-resource-panel__secondary-button"
                    disabled={isBusy.value}
                    type="button"
                    onClick$={() => updateStatus("open")}
                  >
                    Reopen
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div class="pull-request-detail-page__body-shell">
            {pullRequest.value.body ? (
              <MarkdownViewer content={pullRequest.value.body} variant="comment" />
            ) : (
              <p class="issue-detail-page__empty-copy">No description provided.</p>
            )}
          </div>

          {pullRequest.value.viewer_can_update ? (
            <div class="pull-request-detail-page__labels-panel">
              <div>
                <h2 class="pull-request-detail-page__labels-title">Labels</h2>
                <p class="issue-detail-page__meta">
                  Use commas to assign or clear pull request labels.
                </p>
              </div>
              <div class="pull-request-detail-page__labels-row">
                <input
                  class="settings-drawer-form__input"
                  placeholder="bug, enhancement"
                  value={labelInput.value}
                  onInput$={(_, currentTarget) => {
                    labelInput.value = currentTarget.value;
                  }}
                />
                <button
                  class="settings-resource-panel__secondary-button"
                  disabled={isBusy.value}
                  type="button"
                  onClick$={saveLabels}
                >
                  Save labels
                </button>
              </div>
            </div>
          ) : null}
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

const PullRequestStatus = component$(({ status }: { status: PullRequest["status"] }) => {
  const tone =
    status === "merged"
      ? "repository-status-badge--merged"
      : status === "closed"
        ? "repository-status-badge--closed"
        : "repository-status-badge--open";
  return <span class={["repository-status-badge", tone]}>{status}</span>;
});

const BranchBadge = component$(({ label }: { label: string }) => {
  return <span class="pull-request-detail-page__branch-badge">{label}</span>;
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function joinLabels(labels: PullRequest["labels"]) {
  return labels.map((label) => label.name).join(", ");
}

function labelList(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}
