import { $, type PropFunction, component$, useSignal } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { Drawer } from "~/components/ui/Drawer";
import type { Repository, RepositoryBranch } from "~/lib/api";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type RepositoryGeneralSettingsFormProps = {
  branches: RepositoryBranch[];
  redirectTo: string;
  repository: Repository;
};

type DangerAction = "archive" | "delete" | "transfer" | "visibility" | null;

export const RepositoryGeneralSettingsForm = component$(
  ({ branches, redirectTo, repository }: RepositoryGeneralSettingsFormProps) => {
    const nav = useNavigate();
    const name = useSignal(repository.name);
    const defaultBranch = useSignal(repository.default_branch);
    const issuesEnabled = useSignal(Boolean(repository.issues_enabled));
    const pullRequestsEnabled = useSignal(Boolean(repository.pull_requests_enabled));
    const pullRequestPolicy = useSignal(
      repository.pull_request_policy || "anyone",
    );
    const visibility = useSignal(repository.visibility);
    const transferOwner = useSignal("");
    const confirmation = useSignal("");
    const activeAction = useSignal<DangerAction>(null);
    const message = useSignal("");
    const isSaving = useSignal(false);

    const repoLabel = `${repository.owner_handle}/${repository.name}`;
    const repoPath = `/repos/${encodeURIComponent(repository.owner_handle)}/${encodeURIComponent(repository.name)}`;

    const saveGeneral = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update repository settings.";
        return;
      }

      isSaving.value = true;
      message.value = "";
      const response = await fetch(`${publicApiBaseUrl()}${repoPath}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.value,
          default_branch: defaultBranch.value,
          issues_enabled: issuesEnabled.value,
          pull_requests_enabled: pullRequestsEnabled.value,
          pull_request_policy: pullRequestPolicy.value,
        }),
      });

      isSaving.value = false;
      if (!response.ok) {
        await showError(response, message, "Unable to save repository settings.");
        return;
      }

      const updated = (await response.json()) as Repository;
      message.value = "Repository settings saved.";
      await nav(
        `/${encodeURIComponent(updated.owner_handle)}/${encodeURIComponent(updated.name)}/settings`,
      );
    });

    const changeVisibility = $(async () => {
      await runDangerRequest(
        message,
        isSaving,
        activeAction,
        confirmation,
        nav,
        `${publicApiBaseUrl()}${repoPath}`,
        {
          method: "PATCH",
          body: JSON.stringify({ visibility: visibility.value }),
        },
      );
    });

    const transferRepository = $(async () => {
      await runDangerRequest(
        message,
        isSaving,
        activeAction,
        confirmation,
        nav,
        `${publicApiBaseUrl()}${repoPath}/transfer`,
        {
          method: "POST",
          body: JSON.stringify({ owner: transferOwner.value }),
        },
      );
    });

    const archiveRepository = $(async () => {
      await runDangerRequest(
        message,
        isSaving,
        activeAction,
        confirmation,
        nav,
        `${publicApiBaseUrl()}${repoPath}/archive`,
        {
          method: "POST",
          body: JSON.stringify({ archived: !repository.archived_at }),
        },
      );
    });

    const deleteRepository = $(async () => {
      if (confirmation.value !== repoLabel) {
        message.value = `Type ${repoLabel} to confirm deletion.`;
        return;
      }
      await runDangerRequest(
        message,
        isSaving,
        activeAction,
        confirmation,
        nav,
        `${publicApiBaseUrl()}${repoPath}`,
        { method: "DELETE" },
        redirectTo,
      );
    });

    return (
      <main class="settings-general-page">
        <section class="settings-group-page__copy">
          <h2 class="settings-group-page__title">General settings</h2>
          <p class="settings-group-page__description">
            Control repository identity, defaults, and contribution rules.
          </p>
        </section>

        <div class="settings-general-page__stack">
          <section class="settings-general-card">
            <div>
              <h3 class="settings-general-card__title">Repository name</h3>
              <p class="settings-general-card__description">
                Rename this repository within the current owner namespace.
              </p>
            </div>
            <label class="settings-drawer-form__label">
              <span class="settings-drawer-form__heading">Name</span>
              <input
                class="settings-drawer-form__input"
                required
                value={name.value}
                onInput$={(event) => {
                  name.value = (event.target as HTMLInputElement).value;
                }}
              />
            </label>
          </section>

          <section class="settings-general-card">
            <div>
              <h3 class="settings-general-card__title">Default branch</h3>
              <p class="settings-general-card__description">
                Choose the branch shown first for code and pull requests.
              </p>
            </div>
            <select
              class="settings-drawer-form__input settings-general-card__select"
              value={defaultBranch.value}
              onChange$={(event) => {
                defaultBranch.value = (event.target as HTMLSelectElement).value;
              }}
            >
              {branches.length === 0 ? (
                <option value={defaultBranch.value}>
                  {`${defaultBranch.value} (default)`}
                </option>
              ) : null}
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {`${branch.name}${branch.is_default ? " (default)" : ""}`}
                </option>
              ))}
            </select>
          </section>

          <section class="settings-general-card">
            <div>
              <h3 class="settings-general-card__title">Features</h3>
              <p class="settings-general-card__description">
                Enable or disable repository features.
              </p>
            </div>
            <label class="settings-toggle">
              <input
                checked={issuesEnabled.value}
                type="checkbox"
                onChange$={(event) => {
                  issuesEnabled.value = (event.target as HTMLInputElement).checked;
                }}
              />
              <span>
                <span class="settings-toggle__title">Issues</span>
                <span class="settings-toggle__description">
                  Allow issue tracking in this repository.
                </span>
              </span>
            </label>
            <label class="settings-toggle">
              <input
                checked={pullRequestsEnabled.value}
                type="checkbox"
                onChange$={(event) => {
                  pullRequestsEnabled.value = (
                    event.target as HTMLInputElement
                  ).checked;
                }}
              />
              <span>
                <span class="settings-toggle__title">Pull requests</span>
                <span class="settings-toggle__description">
                  Allow pull requests against this repository.
                </span>
              </span>
            </label>
          </section>

          <section class="settings-general-card">
            <div>
              <h3 class="settings-general-card__title">Pull request permissions</h3>
              <p class="settings-general-card__description">
                Choose who can open pull requests.
              </p>
            </div>
            <label class="settings-toggle">
              <input
                checked={pullRequestPolicy.value === "anyone"}
                name="pull-request-policy"
                type="radio"
                value="anyone"
                onChange$={(event) => {
                  pullRequestPolicy.value = (event.target as HTMLInputElement).value;
                }}
              />
              <span>
                <span class="settings-toggle__title">
                  Allow pull requests from anyone
                </span>
                <span class="settings-toggle__description">
                  Any signed-in user or accepted remote contributor can propose
                  changes.
                </span>
              </span>
            </label>
            <label class="settings-toggle">
              <input
                checked={pullRequestPolicy.value === "collaborators"}
                name="pull-request-policy"
                type="radio"
                value="collaborators"
                onChange$={(event) => {
                  pullRequestPolicy.value = (event.target as HTMLInputElement).value;
                }}
              />
              <span>
                <span class="settings-toggle__title">
                  Allow pull requests only from collaborators
                </span>
                <span class="settings-toggle__description">
                  Restrict new pull requests to users with repository access.
                </span>
              </span>
            </label>
          </section>
        </div>

        <div class="settings-group-page__actions">
          <button
            class="settings-resource-panel__primary-button"
            disabled={isSaving.value}
            type="button"
            onClick$={saveGeneral}
          >
            {isSaving.value ? "Saving..." : "Save changes"}
          </button>
          {message.value ? (
            <p class="settings-group-page__message">{message.value}</p>
          ) : null}
        </div>

        <section class="settings-danger-zone">
          <div class="settings-danger-zone__header">
            <h3 class="settings-danger-zone__title">Danger Zone</h3>
          </div>
          <DangerRow
            action="Change repository visibility"
            description="Switch this repository between public and private visibility."
            onClick$={$(() => {
              visibility.value = repository.visibility === "private" ? "public" : "private";
              activeAction.value = "visibility";
            })}
          />
          <DangerRow
            action="Transfer ownership"
            description="Move this repository to another user or organization namespace."
            onClick$={$(() => {
              activeAction.value = "transfer";
            })}
          />
          <DangerRow
            action={
              repository.archived_at
                ? "Unarchive this repository"
                : "Archive this repository"
            }
            description="Archived repositories are kept for reference and can be unarchived later."
            onClick$={$(() => {
              activeAction.value = "archive";
            })}
          />
          <DangerRow
            action="Delete this repository"
            description="Permanently delete the repository and Git storage."
            onClick$={$(() => {
              activeAction.value = "delete";
            })}
          />
        </section>

        <Drawer
          isOpen={activeAction.value === "visibility"}
          onClose$={$(() => {
            activeAction.value = null;
          })}
          title="Change repository visibility"
        >
          <div class="settings-drawer-form">
            <p class="settings-group-page__message">
              Change {repoLabel} to {visibility.value} visibility.
            </p>
            <select
              class="settings-drawer-form__input settings-general-card__select"
              value={visibility.value}
              onChange$={(event) => {
                visibility.value = (event.target as HTMLSelectElement).value;
              }}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <ConfirmButton
              disabled={isSaving.value}
              label="Change visibility"
              onClick$={changeVisibility}
            />
          </div>
        </Drawer>

        <Drawer
          isOpen={activeAction.value === "transfer"}
          onClose$={$(() => {
            activeAction.value = null;
          })}
          title="Transfer ownership"
        >
          <div class="settings-drawer-form">
            <p class="settings-group-page__message">
              Enter the destination user or organization handle.
            </p>
            <input
              class="settings-drawer-form__input"
              value={transferOwner.value}
              onInput$={(event) => {
                transferOwner.value = (event.target as HTMLInputElement).value;
              }}
            />
            <ConfirmButton
              disabled={isSaving.value || !transferOwner.value.trim()}
              label="Transfer repository"
              onClick$={transferRepository}
            />
          </div>
        </Drawer>

        <Drawer
          isOpen={activeAction.value === "archive"}
          onClose$={$(() => {
            activeAction.value = null;
          })}
          title={repository.archived_at ? "Unarchive repository" : "Archive repository"}
        >
          <div class="settings-drawer-form">
            <p class="settings-group-page__message">
              {repository.archived_at
                ? "Restore this repository to active use."
                : "Mark this repository as archived."}
            </p>
            <ConfirmButton
              disabled={isSaving.value}
              label={
                repository.archived_at ? "Unarchive repository" : "Archive repository"
              }
              onClick$={archiveRepository}
            />
          </div>
        </Drawer>

        <Drawer
          isOpen={activeAction.value === "delete"}
          onClose$={$(() => {
            activeAction.value = null;
          })}
          title="Delete repository"
        >
          <div class="settings-drawer-form">
            <p class="settings-group-page__message">
              This permanently deletes {repoLabel}. Type the full repository name
              to confirm.
            </p>
            <input
              class="settings-drawer-form__input"
              placeholder={repoLabel}
              value={confirmation.value}
              onInput$={(event) => {
                confirmation.value = (event.target as HTMLInputElement).value;
              }}
            />
            <ConfirmButton
              disabled={isSaving.value}
              label="Delete repository"
              onClick$={deleteRepository}
            />
          </div>
        </Drawer>
      </main>
    );
  },
);

const DangerRow = component$(
  ({
    action,
    description,
    onClick$,
  }: {
    action: string;
    description: string;
    onClick$: PropFunction<() => void>;
  }) => {
    return (
      <div class="settings-danger-zone__row">
        <div>
          <h4 class="settings-danger-zone__row-title">{action}</h4>
          <p class="settings-danger-zone__row-description">{description}</p>
        </div>
        <button
          class="oauth-panel__danger-button"
          type="button"
          onClick$={onClick$}
        >
          {action}
        </button>
      </div>
    );
  },
);

const ConfirmButton = component$(
  ({
    disabled,
    label,
    onClick$,
  }: {
    disabled: boolean;
    label: string;
    onClick$: PropFunction<() => void>;
  }) => {
    return (
      <button
        class="oauth-panel__danger-button"
        disabled={disabled}
        type="button"
        onClick$={onClick$}
      >
        {disabled ? "Working..." : label}
      </button>
    );
  },
);

async function runDangerRequest(
  message: { value: string },
  isSaving: { value: boolean },
  activeAction: { value: DangerAction },
  confirmation: { value: string },
  nav: (path: string) => Promise<void>,
  url: string,
  init: RequestInit,
  redirect?: string,
) {
  const token = getAuthToken();
  if (!token) {
    message.value = "Sign in to update repository settings.";
    return;
  }

  isSaving.value = true;
  message.value = "";
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  isSaving.value = false;
  if (!response.ok) {
    await showError(response, message, "Action failed.");
    return;
  }

  activeAction.value = null;
  confirmation.value = "";
  if (redirect) {
    await nav(redirect);
    return;
  }

  const updated =
    response.status === 204
      ? null
      : (((await response.json().catch(() => null)) as Repository | null) ?? null);
  if (updated?.owner_handle && updated?.name) {
    await nav(
      `/${encodeURIComponent(updated.owner_handle)}/${encodeURIComponent(updated.name)}/settings`,
    );
  }
}

async function showError(
  response: Response,
  message: { value: string },
  fallback: string,
) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  message.value = body?.error ?? `${fallback} (${response.status})`;
}
