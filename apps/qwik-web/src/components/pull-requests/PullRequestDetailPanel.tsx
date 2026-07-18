import { $, component$, useSignal } from "@builder.io/qwik";

import { ConversationPanel } from "~/components/comments/ConversationPanel";
import { MarkdownViewer } from "~/components/markdown/MarkdownViewer";
import { PullRequestConflictDrawer } from "~/components/pull-requests/PullRequestConflictDrawer";
import { RepositoryLabelBadges } from "~/components/repository/RepositoryLabelBadges";
import { getAuthToken } from "~/lib/auth-session";
import {
  publicApiBaseUrl,
  pullRequestForceRebaseApiPath,
  pullRequestMergeStateApiPath,
  pullRequestResolveConflictsApiPath,
  type ActivityItem,
  type PullRequest,
  type PullRequestConflictResolutionChoice,
  type PullRequestMergeState,
} from "~/lib/api";

type PullRequestDetailPanelProps = {
  activity: ActivityItem[];
  baseHref: string;
  mergeState: PullRequestMergeState;
  name: string;
  owner: string;
  pullRequest: PullRequest;
};

async function responseErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return `${fallback}: ${body.error.trim()}`;
    }
  } catch {
    // Ignore malformed error payloads and fall back to the status code.
  }

  return `${fallback}: ${response.status}`;
}

export const PullRequestDetailPanel = component$(
  ({
    activity,
    baseHref,
  mergeState: initialMergeState,
    name,
    owner,
    pullRequest: initialPullRequest,
  }: PullRequestDetailPanelProps) => {
    const pullRequest = useSignal(initialPullRequest);
    const mergeState = useSignal(initialMergeState);
    const labelInput = useSignal(joinLabels(initialPullRequest.labels));
    const message = useSignal("");
    const busyAction = useSignal<
      null | "merge" | "resolve" | "rebase" | "status" | "labels"
    >(null);
    const isConflictDrawerOpen = useSignal(false);
    const conflictResolutions = useSignal<
      Partial<Record<string, PullRequestConflictResolutionChoice>>
    >({});

    const commentsUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.value.id))}/comments`;
    const activityUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${encodeURIComponent(String(pullRequest.value.id))}/activity`;
    const attachmentUploadUrl = `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/comment-attachments`;
    const canManageConflictState =
      pullRequest.value.status === "open" &&
      (mergeState.value.can_force_rebase || mergeState.value.files.length > 0);
    const mergeBlockedByConflicts = mergeState.value.status === "conflicts";

    const updateStatus = $(async (status: "open" | "closed") => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update pull requests.";
        return;
      }

      busyAction.value = "status";
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
      busyAction.value = null;

      if (!response.ok) {
        message.value = await responseErrorMessage(response, "Failed to update pull request");
        return;
      }

      const nextPullRequest = (await response.json()) as PullRequest;
      pullRequest.value = nextPullRequest;
      labelInput.value = joinLabels(nextPullRequest.labels);
      const mergeStateResponse = await fetch(
        `${publicApiBaseUrl()}${pullRequestMergeStateApiPath(owner, name, pullRequest.value.id)}`,
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!mergeStateResponse.ok) {
        mergeState.value = unavailableMergeState(
          `Merge state unavailable: ${mergeStateResponse.status}`,
        );
      } else {
        mergeState.value =
          (await mergeStateResponse.json()) as PullRequestMergeState;
      }
      message.value = status === "closed" ? "Pull request closed." : "Pull request reopened.";
    });

    const mergePullRequest = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to merge pull requests.";
        return;
      }

      busyAction.value = "merge";
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(String(pullRequest.value.id))}/merge`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      busyAction.value = null;

      if (!response.ok) {
        message.value = await responseErrorMessage(response, "Merge failed");
        return;
      }

      const nextPullRequest = (await response.json()) as PullRequest;
      pullRequest.value = nextPullRequest;
      labelInput.value = joinLabels(nextPullRequest.labels);
      mergeState.value = {
        ...mergeState.value,
        status: "merged",
        can_force_rebase: false,
        can_resolve: false,
        files: [],
        message: null,
      };
      message.value = "Pull request merged.";
    });

    const saveLabels = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update labels.";
        return;
      }

      busyAction.value = "labels";
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
      busyAction.value = null;

      if (!response.ok) {
        message.value = await responseErrorMessage(response, "Failed to update labels");
        return;
      }

      const nextPullRequest = (await response.json()) as PullRequest;
      pullRequest.value = nextPullRequest;
      labelInput.value = joinLabels(nextPullRequest.labels);
      message.value = "Pull request labels updated.";
    });

    const openConflictDrawer = $(async () => {
      if (mergeState.value.status !== "conflicts") {
        return;
      }

      isConflictDrawerOpen.value = true;
    });

    const selectConflictResolution = $(
      ({
        path,
        resolution,
      }: {
        path: string;
        resolution: PullRequestConflictResolutionChoice;
      }) => {
        conflictResolutions.value = {
          ...conflictResolutions.value,
          [path]: resolution,
        };
      },
    );

    const resolveConflicts = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to resolve pull request conflicts.";
        return;
      }

      busyAction.value = "resolve";
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}${pullRequestResolveConflictsApiPath(
          owner,
          name,
          pullRequest.value.id,
        )}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            files: mergeState.value.files
              .filter((file) => file.can_resolve)
              .map((file) => ({
                path: file.path,
                resolution: conflictResolutions.value[file.path],
              })),
          }),
        },
      );
      busyAction.value = null;

      if (!response.ok) {
        message.value = await responseErrorMessage(
          response,
          "Failed to resolve merge conflicts",
        );
        return;
      }

      mergeState.value = (await response.json()) as PullRequestMergeState;
      conflictResolutions.value = {};
      isConflictDrawerOpen.value = false;
      message.value = "Conflicts resolved on the source branch.";
    });

    const forceRebase = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to rebase the source branch.";
        return;
      }
      if (
        !window.confirm(
          `Force rebase ${pullRequest.value.source_branch} onto ${pullRequest.value.target_branch}? This rewrites the source branch history.`,
        )
      ) {
        return;
      }

      busyAction.value = "rebase";
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}${pullRequestForceRebaseApiPath(
          owner,
          name,
          pullRequest.value.id,
        )}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      busyAction.value = null;

      if (!response.ok) {
        message.value = await responseErrorMessage(response, "Force rebase failed");
        return;
      }

      mergeState.value = (await response.json()) as PullRequestMergeState;
      conflictResolutions.value = {};
      message.value = `Rebased ${pullRequest.value.source_branch} onto ${pullRequest.value.target_branch}.`;
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
              <MergeStateBanner mergeState={mergeState.value} />
              <RepositoryLabelBadges labels={pullRequest.value.labels} />
            </div>

            {pullRequest.value.viewer_can_update || canManageConflictState ? (
              <div class="pull-request-detail-page__hero-actions">
                {pullRequest.value.status === "open" ? (
                  <>
                    {pullRequest.value.viewer_can_update && !mergeBlockedByConflicts ? (
                      <button
                        class="settings-resource-panel__primary-button"
                        disabled={busyAction.value !== null}
                        type="button"
                        onClick$={mergePullRequest}
                      >
                        {busyAction.value === "merge"
                          ? "Working..."
                          : "Merge pull request"}
                      </button>
                    ) : null}
                    {mergeBlockedByConflicts ? (
                      <button
                        class="settings-resource-panel__primary-button"
                        disabled={busyAction.value !== null}
                        type="button"
                        onClick$={openConflictDrawer}
                      >
                        Resolve conflicts
                      </button>
                    ) : null}
                    {mergeState.value.can_force_rebase ? (
                      <button
                        class="settings-resource-panel__secondary-button"
                        disabled={busyAction.value !== null}
                        type="button"
                        onClick$={forceRebase}
                      >
                        {busyAction.value === "rebase"
                          ? "Rebasing..."
                          : `Force rebase onto ${pullRequest.value.target_branch}`}
                      </button>
                    ) : null}
                    {pullRequest.value.viewer_can_update ? (
                      <button
                        class="conversation-panel__danger-button"
                        disabled={busyAction.value !== null}
                        type="button"
                        onClick$={() => updateStatus("closed")}
                      >
                        Close
                      </button>
                    ) : null}
                  </>
                ) : null}
                {pullRequest.value.status === "closed" ? (
                  <button
                    class="settings-resource-panel__secondary-button"
                    disabled={busyAction.value !== null}
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
                  disabled={busyAction.value !== null}
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

        <PullRequestConflictDrawer
          currentLabel={mergeState.value.current_label}
          files={mergeState.value.files}
          incomingLabel={mergeState.value.incoming_label}
          isOpen={isConflictDrawerOpen.value}
          isSubmitting={busyAction.value === "resolve"}
          onClose$={$(() => {
            isConflictDrawerOpen.value = false;
          })}
          onResolve$={resolveConflicts}
          onSelectResolution$={selectConflictResolution}
          resolutions={conflictResolutions.value}
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

const MergeStateBanner = component$(
  ({ mergeState }: { mergeState: PullRequestMergeState }) => {
    const tone =
      mergeState.status === "mergeable"
        ? "pull-request-detail-page__merge-state-pill--mergeable"
        : mergeState.status === "conflicts"
          ? "pull-request-detail-page__merge-state-pill--conflicts"
          : "pull-request-detail-page__merge-state-pill--muted";

    return (
      <div class="pull-request-detail-page__merge-state">
        <div class="pull-request-detail-page__merge-state-header">
          <span class={["pull-request-flow__status-pill", tone]}>
            {mergeStateLabel(mergeState)}
          </span>
          {mergeState.status === "conflicts" ? (
            <span class="issue-detail-page__meta">
              {mergeState.files.length} conflicted{" "}
              {mergeState.files.length === 1 ? "file" : "files"}
            </span>
          ) : null}
        </div>
        {mergeState.message ? (
          <p class="issue-detail-page__meta">{mergeState.message}</p>
        ) : null}
      </div>
    );
  },
);

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

function mergeStateLabel(mergeState: PullRequestMergeState) {
  switch (mergeState.status) {
    case "mergeable":
      return "Mergeable";
    case "conflicts":
      return "Conflicts detected";
    case "external_readonly":
      return "Local resolution unavailable";
    case "unavailable":
      return "Merge state unavailable";
    case "merged":
      return "Already merged";
    case "closed":
      return "Pull request closed";
    default:
      return mergeState.status;
  }
}

function unavailableMergeState(message: string): PullRequestMergeState {
  return {
    status: "unavailable",
    message,
    can_resolve: false,
    can_force_rebase: false,
    current_label: "",
    incoming_label: "",
    files: [],
  };
}
