import { $, component$, useSignal } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { Drawer } from "~/components/ui/Drawer";
import type { Organization } from "~/lib/api";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type OrganizationGeneralSettingsFormProps = {
  organization: Organization;
};

export const OrganizationGeneralSettingsForm = component$(
  ({ organization }: OrganizationGeneralSettingsFormProps) => {
    const nav = useNavigate();
    const displayName = useSignal(organization.display_name);
    const description = useSignal(organization.description);
    const isSaving = useSignal(false);
    const message = useSignal("");
    const isDeleteOpen = useSignal(false);
    const confirmation = useSignal("");

    const saveOrganization = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to update organization settings.";
        return;
      }

      isSaving.value = true;
      message.value = "";

      const response = await fetch(
        `${publicApiBaseUrl()}/organizations/${encodeURIComponent(organization.name)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            display_name: displayName.value,
            description: description.value,
          }),
        },
      );

      isSaving.value = false;
      if (!response.ok) {
        await showError(response, message, "Unable to save organization settings.");
        return;
      }

      message.value = "Organization settings saved.";
    });

    const deleteOrganization = $(async () => {
      if (confirmation.value !== organization.name) {
        message.value = `Type ${organization.name} to confirm deletion.`;
        return;
      }

      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to delete organizations.";
        return;
      }

      isSaving.value = true;
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}/organizations/${encodeURIComponent(organization.name)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      isSaving.value = false;

      if (!response.ok) {
        await showError(response, message, "Unable to delete organization.");
        return;
      }

      await nav("/organizations");
    });

    return (
      <main class="settings-general-page">
        <section class="settings-group-page__copy">
          <h2 class="settings-group-page__title">General settings</h2>
          <p class="settings-group-page__description">
            Control organization identity and administrative actions.
          </p>
        </section>

        <section class="settings-general-card">
          <div>
            <h3 class="settings-general-card__title">Organization profile</h3>
            <p class="settings-general-card__description">
              Update the public name and description for @{organization.name}.
            </p>
          </div>
          <label class="settings-drawer-form__label">
            <span class="settings-drawer-form__heading">Display name</span>
            <input
              class="settings-drawer-form__input"
              required
              value={displayName.value}
              onInput$={(event) => {
                displayName.value = (event.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label class="settings-drawer-form__label">
            <span class="settings-drawer-form__heading">Description</span>
            <textarea
              class="settings-drawer-form__textarea settings-drawer-form__textarea--plain"
              value={description.value}
              onInput$={(event) => {
                description.value = (event.target as HTMLTextAreaElement).value;
              }}
            />
          </label>
          <div class="settings-group-page__actions">
            <button
              class="settings-resource-panel__primary-button"
              disabled={isSaving.value}
              type="button"
              onClick$={saveOrganization}
            >
              {isSaving.value ? "Saving..." : "Save changes"}
            </button>
            {message.value ? (
              <p class="settings-group-page__message">{message.value}</p>
            ) : null}
          </div>
        </section>

        <section class="settings-danger-zone">
          <div class="settings-danger-zone__header">
            <h3 class="settings-danger-zone__title">Danger Zone</h3>
          </div>
          <div class="settings-danger-zone__row">
            <div>
              <h4 class="settings-danger-zone__row-title">Delete this organization</h4>
              <p class="settings-danger-zone__row-description">
                Permanently delete this organization. Repositories must be moved
                or deleted first.
              </p>
            </div>
            <button
              class="oauth-panel__danger-button"
              type="button"
              onClick$={$(() => {
                isDeleteOpen.value = true;
              })}
            >
              Delete this organization
            </button>
          </div>
        </section>

        <Drawer
          isOpen={isDeleteOpen.value}
          onClose$={$(() => {
            isDeleteOpen.value = false;
          })}
          title="Delete organization"
        >
          <div class="settings-drawer-form">
            <p class="settings-group-page__message">
              Type {organization.name} to confirm deletion.
            </p>
            <input
              class="settings-drawer-form__input"
              placeholder={organization.name}
              value={confirmation.value}
              onInput$={(event) => {
                confirmation.value = (event.target as HTMLInputElement).value;
              }}
            />
            <button
              class="oauth-panel__danger-button"
              disabled={isSaving.value}
              type="button"
              onClick$={deleteOrganization}
            >
              {isSaving.value ? "Deleting..." : "Delete organization"}
            </button>
          </div>
        </Drawer>
      </main>
    );
  },
);

async function showError(
  response: Response,
  message: { value: string },
  fallback: string,
) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  message.value = body?.error ?? `${fallback} (${response.status})`;
}
