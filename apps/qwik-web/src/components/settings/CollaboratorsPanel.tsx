import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import { Drawer } from "~/components/ui/Drawer";
import type { Collaborator } from "~/lib/api";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type CollaboratorsPanelProps = {
  addPath: string;
  collaborators: Collaborator[];
  permissionName: "permission" | "role";
  scopeLabel: string;
};

export const CollaboratorsPanel = component$(
  ({ addPath, collaborators, permissionName, scopeLabel }: CollaboratorsPanelProps) => {
    const items = useSignal(collaborators);
    const isOpen = useSignal(false);
    const username = useSignal("");
    const access = useSignal(permissionName === "role" ? "member" : "write");
    const message = useSignal("");
    const isSaving = useSignal(false);

    const loadCollaborators = $(async () => {
      const token = getAuthToken();
      if (scopeLabel === "repository" && !token) {
        return;
      }

      const response = await fetch(`${publicApiBaseUrl()}${addPath}`, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        message.value = `Unable to load collaborators. (${response.status})`;
        return;
      }
      const body = (await response.json()) as { data: Collaborator[] };
      items.value = body.data;
      message.value = "";
    });

    useTask$(async () => {
      if (!isBrowser) {
        return;
      }
      if (collaborators.length > 0) {
        return;
      }
      await loadCollaborators();
    });

    const addCollaborator = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to manage collaborators.";
        return;
      }

      isSaving.value = true;
      message.value = "";
      const response = await fetch(`${publicApiBaseUrl()}${addPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.value,
          [permissionName]: access.value,
        }),
      });
      isSaving.value = false;
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        message.value = body?.error ?? "Unable to save collaborator.";
        return;
      }
      username.value = "";
      isOpen.value = false;
      await loadCollaborators();
    });

    return (
      <main class="settings-group-page">
        <section class="settings-group-page__header">
          <div class="settings-group-page__copy">
            <h2 class="settings-group-page__title">Collaborators</h2>
            <p class="settings-group-page__description">
              Manage who can access this {scopeLabel}.
            </p>
          </div>
          <button
            class="settings-resource-panel__primary-button"
            type="button"
            onClick$={() => {
              isOpen.value = true;
            }}
          >
            Add collaborator
          </button>
        </section>

        <section class="settings-resource-panel">
          {items.value.length === 0 ? (
            <p class="settings-resource-panel__empty">
              No collaborators have been added yet.
            </p>
          ) : (
            <div class="settings-resource-panel__body">
              {items.value.map((collaborator) => (
                <article class="settings-resource-item settings-collaborator" key={collaborator.id}>
                  <div>
                    <h3 class="settings-collaborator__title">
                      {collaborator.display_name}
                    </h3>
                    <p class="settings-collaborator__handle">
                      @{collaborator.username}
                    </p>
                  </div>
                  <span class="runner-panel__pill">
                    {collaborator[permissionName] ?? "member"}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <Drawer
          isOpen={isOpen.value}
          onClose$={$(() => {
            isOpen.value = false;
          })}
          title="Add collaborator"
        >
          <div class="settings-drawer-form">
            <label class="settings-drawer-form__label">
              <span class="settings-drawer-form__heading">Username</span>
              <input
                class="settings-drawer-form__input"
                required
                value={username.value}
                onInput$={(event) => {
                  username.value = (event.target as HTMLInputElement).value;
                }}
              />
            </label>
            <label class="settings-drawer-form__label">
              <span class="settings-drawer-form__heading">
                {permissionName === "role" ? "Role" : "Permission"}
              </span>
              <select
                class="settings-drawer-form__input"
                value={access.value}
                onChange$={(event) => {
                  access.value = (event.target as HTMLSelectElement).value;
                }}
              >
                {permissionName === "role" ? (
                  <>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </>
                ) : (
                  <>
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </>
                )}
              </select>
            </label>
            <div class="settings-group-page__actions">
              <button
                class="settings-resource-panel__primary-button"
                disabled={isSaving.value}
                type="button"
                onClick$={addCollaborator}
              >
                {isSaving.value ? "Saving..." : "Save collaborator"}
              </button>
              {message.value ? (
                <p class="settings-group-page__message">{message.value}</p>
              ) : null}
            </div>
          </div>
        </Drawer>
      </main>
    );
  },
);
