import { $, component$, type PropFunction, useSignal } from "@builder.io/qwik";
import { Link, useNavigate } from "@builder.io/qwik-city";

import { CodeDiff } from "~/components/repository/code/CodeDiff";
import { getAuthToken } from "~/lib/auth-session";
import {
  publicApiBaseUrl,
  type PullRequestOptions,
  type RepositoryCompare,
} from "~/lib/api";
import {
  type PullRequestSourceMode,
  type PullRequestSourceSelection,
  decodePullRequestSource,
  normalizeServerUrl,
} from "~/lib/pull-request-flow";

type PullRequestSourceStepProps = {
  baseHref: string;
  options: PullRequestOptions;
};

export const PullRequestSourceStep = component$(
  ({ baseHref, options }: PullRequestSourceStepProps) => {
    const nav = useNavigate();
    const sourceMode = useSignal<PullRequestSourceMode>("local");
    const serverName = useSignal("");
    const message = useSignal("");

    const continueToCompare = $(async () => {
      const params = new URLSearchParams({ sourceMode: sourceMode.value });
      if (sourceMode.value === "server") {
        const normalizedServer = normalizeServerUrl(serverName.value);
        if (!normalizedServer) {
          message.value = "Enter the server name first.";
          return;
        }
        params.set("server", normalizedServer);
      }
      await nav(`${baseHref}/pull-requests/new/compare?${params.toString()}`);
    });

    return (
      <form
        class="pull-request-flow__card"
        onSubmit$={continueToCompare}
        preventdefault:submit
      >
        <StepHeading number={1} title="Where are the changes?" />

        <div class="pull-request-flow__source-grid">
          <SourceCard
            checked={sourceMode.value === "local"}
            description="Pick a branch from this repository or one of its local forks."
            label="This server"
            value="local"
            onChange$={$((value) => {
              sourceMode.value = value;
            })}
          />
          <SourceCard
            checked={sourceMode.value === "server"}
            description="Compare against the same repository name on another Diggit server."
            label="Another server"
            value="server"
            onChange$={$((value) => {
              sourceMode.value = value;
            })}
          />
          {options.upstream ? (
            <SourceCard
              checked={sourceMode.value === "upstream"}
              description={`Use the original repository: ${options.upstream.owner_handle}/${options.upstream.name}.`}
              label="Original server repo"
              value="upstream"
              onChange$={$((value) => {
                sourceMode.value = value;
              })}
            />
          ) : null}
        </div>

        {sourceMode.value === "server" ? (
          <label class="pull-request-flow__field">
            Server name
            <input
              class="settings-drawer-form__input"
              placeholder="https://git.example.com"
              required
              value={serverName.value}
              onInput$={(_, currentTarget) => {
                serverName.value = currentTarget.value;
              }}
            />
          </label>
        ) : null}

        <div class="pull-request-flow__footer">
          {message.value ? (
            <p class="issue-detail-page__message">{message.value}</p>
          ) : (
            <span />
          )}
          <button class="settings-resource-panel__primary-button" type="submit">
            Continue to compare
          </button>
        </div>
      </form>
    );
  },
);

type PullRequestCompareStepProps = {
  baseHref: string;
  fromOptions: { label: string; options: { label: string; value: string }[] }[];
  initialCompare: RepositoryCompare;
  name: string;
  owner: string;
  selectedFrom: string;
  selectedTarget: string;
  serverName?: string;
  sourceMode: PullRequestSourceMode;
  targetOptions: { label: string; value: string }[];
  upstreamLabel?: string;
};

export const PullRequestCompareStep = component$(
  ({
    baseHref,
    fromOptions,
    initialCompare,
    name,
    owner,
    selectedFrom,
    selectedTarget,
    serverName,
    sourceMode,
    targetOptions,
    upstreamLabel,
  }: PullRequestCompareStepProps) => {
    const currentFrom = useSignal(selectedFrom);
    const currentTarget = useSignal(selectedTarget);
    const compare = useSignal(initialCompare);
    const isLoading = useSignal(false);
    const requestId = useSignal(0);
    const sourceLabel =
      sourceMode === "server"
        ? "another server"
        : sourceMode === "upstream"
          ? upstreamLabel ?? "the original repo"
          : "this server";

    const updateComparison = $(async (nextFrom: string, nextTarget: string) => {
      currentFrom.value = nextFrom;
      currentTarget.value = nextTarget;
      const source = decodePullRequestSource(nextFrom);
      if (!source) {
        compare.value = unavailableCompare("Choose a source branch to compare.");
        return;
      }

      requestId.value += 1;
      const activeRequestId = requestId.value;
      isLoading.value = true;
      try {
        const token = getAuthToken();
        const response = await fetch(
          `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/compare`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              source_branch: source.branch,
              source_repo_url: source.url,
              source_repository_id: source.repositoryId,
              target_branch: nextTarget,
            }),
          },
        );
        if (requestId.value !== activeRequestId) {
          return;
        }
        if (!response.ok) {
          compare.value = unavailableCompare(`Comparison failed: ${response.status}`);
          return;
        }
        compare.value = (await response.json()) as RepositoryCompare;
      } catch (error) {
        if (requestId.value === activeRequestId) {
          compare.value = unavailableCompare(error);
        }
      } finally {
        if (requestId.value === activeRequestId) {
          isLoading.value = false;
        }
      }
    });

    const createParams = new URLSearchParams({
      from: currentFrom.value,
      sourceMode,
      targetBranch: currentTarget.value,
    });

    return (
      <>
        <section class="pull-request-flow__card">
          <StepHeading number={2} title="Compare changes between branches" />
          <div class="pull-request-flow__compare-grid">
            <label class="pull-request-flow__field">
              From
              <select
                class="settings-drawer-form__input"
                name="from"
                required
                value={currentFrom.value}
                onChange$={(_, currentTargetElement) =>
                  updateComparison(currentTargetElement.value, currentTarget.value)
                }
              >
                {fromOptions.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div class="pull-request-flow__into">into</div>

            <label class="pull-request-flow__field">
              To
              <select
                class="settings-drawer-form__input"
                name="targetBranch"
                required
                value={currentTarget.value}
                onChange$={(_, currentTargetElement) =>
                  updateComparison(currentFrom.value, currentTargetElement.value)
                }
              >
                {targetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p class="issue-detail-page__meta">
            Showing the diff from {sourceLabel} into the selected target branch.
          </p>
          {serverName ? (
            <p class="pull-request-flow__server">Server: {serverName}</p>
          ) : null}

          <div class="pull-request-flow__footer pull-request-flow__footer--end">
            <Link
              class="settings-resource-panel__secondary-button"
              href={`${baseHref}/pull-requests/new`}
            >
              Back
            </Link>
            <Link
              class="settings-resource-panel__primary-button"
              href={`${baseHref}/pull-requests/new/create?${createParams.toString()}`}
            >
              Continue to create
            </Link>
          </div>
        </section>

        {isLoading.value ? (
          <section class="pull-request-flow__loading">
            <div class="pull-request-flow__spinner" />
            <h3 class="pull-request-flow__loading-title">Loading comparison...</h3>
            <p class="issue-detail-page__meta">Fetching the branch diff.</p>
          </section>
        ) : (
          <>
            <CompareSummary compare={compare.value} />
            <CodeDiff
              emptyLabel="No file changes between these branches."
              files={compare.value.files}
            />
          </>
        )}
      </>
    );
  },
);

type PullRequestCreateFormProps = {
  baseHref: string;
  defaultTitle: string;
  name: string;
  owner: string;
  selection: PullRequestSourceSelection;
  targetBranch: string;
};

export const PullRequestCreateForm = component$(
  ({
    baseHref,
    defaultTitle,
    name,
    owner,
    selection,
    targetBranch,
  }: PullRequestCreateFormProps) => {
    const nav = useNavigate();
    const message = useSignal("");

    const submit = $(async (_event: SubmitEvent, formElement: HTMLFormElement) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to create pull requests.";
        return;
      }

      const form = new FormData(formElement);
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests`,
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
            source_repo_url: selection.url,
            source_branch: selection.branch,
            source_repository_id: selection.repositoryId,
            target_branch: targetBranch,
          }),
        },
      );

      if (!response.ok) {
        message.value = `Failed: ${response.status}`;
        return;
      }

      const pullRequest = (await response.json()) as { id: number };
      await nav(`${baseHref}/pull/${encodeURIComponent(String(pullRequest.id))}`);
    });

    return (
      <form
        class="pull-request-flow__card"
        onSubmit$={submit}
        preventdefault:submit
      >
        <StepHeading number={3} title="Finalize the pull request" />

        <div class="pull-request-flow__summary">
          <span class="pull-request-flow__branch-summary">
            {selection.branch}
          </span>
          <span class="pull-request-flow__arrow">{"->"}</span>
          <span class="pull-request-flow__branch-summary">{targetBranch}</span>
        </div>

        <label class="pull-request-flow__field">
          Title
          <input
            class="settings-drawer-form__input"
            name="title"
            required
            value={defaultTitle}
          />
        </label>

        <label class="pull-request-flow__field">
          Description
          <textarea class="settings-drawer-form__textarea" name="body" />
        </label>

        <label class="pull-request-flow__field">
          Labels
          <input
            class="settings-drawer-form__input"
            name="labels"
            placeholder="bug, enhancement"
          />
        </label>

        {message.value ? <p class="issue-detail-page__message">{message.value}</p> : null}

        <div class="pull-request-flow__footer pull-request-flow__footer--end">
          <Link
            class="settings-resource-panel__secondary-button"
            href={`${baseHref}/pull-requests/new/compare?from=${encodeURIComponent(encodePullSafe(selection))}&targetBranch=${encodeURIComponent(targetBranch)}`}
          >
            Back
          </Link>
          <button class="settings-resource-panel__primary-button" type="submit">
            Create pull request
          </button>
        </div>
      </form>
    );
  },
);

const SourceCard = component$(
  ({
    checked,
    description,
    label,
    onChange$,
    value,
  }: {
    checked: boolean;
    description: string;
    label: string;
    onChange$: PropFunction<(value: PullRequestSourceMode) => void>;
    value: PullRequestSourceMode;
  }) => {
    return (
      <label
        class={[
          "pull-request-flow__source-card",
          checked ? "pull-request-flow__source-card--active" : "",
        ]}
      >
        <input
          checked={checked}
          class="sr-only"
          name="sourceMode"
          type="radio"
          value={value}
          onChange$={() => onChange$(value)}
        />
        <strong>{label}</strong>
        <span>{description}</span>
      </label>
    );
  },
);

const StepHeading = component$(({ number, title }: { number: number; title: string }) => {
  return (
    <div class="pull-request-flow__step">
      <span class="pull-request-flow__step-badge">{number}</span>
      <h3 class="pull-request-flow__step-title">{title}</h3>
    </div>
  );
});

const CompareSummary = component$(({ compare }: { compare: RepositoryCompare }) => {
  if (compare.status === "unavailable") {
    return <section class="pull-request-flow__summary-card">{compare.message ?? "Comparison is unavailable."}</section>;
  }

  return (
    <section class="pull-request-flow__summary-card pull-request-flow__summary-card--stats">
      <span>{compare.ahead_by} commits ahead</span>
      <span>{compare.behind_by} commits behind</span>
      <span class="pull-request-flow__status-pill">
        {compare.status.replaceAll("_", " ")}
      </span>
    </section>
  );
});

function unavailableCompare(error: unknown): RepositoryCompare {
  return {
    ahead_by: 0,
    ahead_commits: [],
    behind_by: 0,
    behind_commits: [],
    files: [],
    message: error instanceof Error ? error.message : String(error),
    source: null,
    status: "unavailable",
  };
}

function labelList(value: string) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function encodePullSafe(selection: PullRequestSourceSelection) {
  return JSON.stringify(selection);
}
