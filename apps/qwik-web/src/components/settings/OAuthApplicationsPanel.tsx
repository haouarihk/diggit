import {
  $,
  type PropFunction,
  component$,
  isBrowser,
  useSignal,
  useTask$,
} from "@builder.io/qwik";
import { Drawer } from "~/components/ui/Drawer";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type OAuthApplication = {
  id: string;
  client_id: string;
  name: string;
  redirect_uri: string;
  scopes: string[];
  created_at: string;
  updated_at: string;
};

type CreatedOAuthApplication = {
  application: OAuthApplication;
  client_secret: string;
};

export const OAuthApplicationsPanel = component$(() => {
  const applications = useSignal<OAuthApplication[]>([]);
  const activeApplication = useSignal<OAuthApplication | null>(null);
  const isCreateOpen = useSignal(false);
  const message = useSignal("");
  const revealedSecret = useSignal<string | null>(null);

  const loadApplications = $(async () => {
    const token = getAuthToken();
    if (!token) {
      applications.value = [];
      message.value = "Sign in to manage OAuth applications.";
      return;
    }

    const response = await fetch(`${publicApiBaseUrl()}/oauth/applications`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      message.value = `Failed to load OAuth applications: ${response.status}`;
      return;
    }

    const body = (await response.json()) as { data: OAuthApplication[] };
    applications.value = body.data;
    message.value = "";
  });

  useTask$(async () => {
    if (!isBrowser || !getAuthToken()) {
      return;
    }
    await loadApplications();
  });

  const createApplication = $(async (
    _event: SubmitEvent,
    formElement: HTMLFormElement,
  ) => {
    const token = getAuthToken();
    if (!token) {
      message.value = "Sign in to create OAuth applications.";
      return;
    }

    const form = new FormData(formElement);
    const scopes = String(form.get("scopes") ?? "api read_user read_repository")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);

    const response = await fetch(`${publicApiBaseUrl()}/oauth/applications`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: form.get("name"),
        redirect_uri: form.get("redirectUri"),
        scopes,
      }),
    });
    if (!response.ok) {
      message.value = `Failed to create OAuth application: ${response.status}`;
      return;
    }

    const body = (await response.json()) as CreatedOAuthApplication;
    revealedSecret.value = body.client_secret;
    activeApplication.value = body.application;
    message.value =
      "OAuth application created. Copy the secret now; it will not be shown again.";
    formElement.reset();
    isCreateOpen.value = false;
    await loadApplications();
  });

  const rotateSecret = $(async (application: OAuthApplication) => {
    const token = getAuthToken();
    if (!token) {
      message.value = "Sign in to rotate application secrets.";
      return;
    }

    const response = await fetch(
      `${publicApiBaseUrl()}/oauth/applications/${application.id}/rotate-secret`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) {
      message.value = `Failed to rotate secret: ${response.status}`;
      return;
    }

    const body = (await response.json()) as CreatedOAuthApplication;
    revealedSecret.value = body.client_secret;
    activeApplication.value = body.application;
    message.value = "Client secret rotated. Copy the new secret now.";
    await loadApplications();
  });

  const deleteApplication = $(async (application: OAuthApplication) => {
    const token = getAuthToken();
    if (!token) {
      message.value = "Sign in to delete OAuth applications.";
      return;
    }

    const response = await fetch(
      `${publicApiBaseUrl()}/oauth/applications/${application.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) {
      message.value = `Failed to delete application: ${response.status}`;
      return;
    }

    activeApplication.value = null;
    revealedSecret.value = null;
    message.value = "OAuth application deleted and its tokens revoked.";
    await loadApplications();
  });

  const copy = $(async (value: string) => {
    await navigator.clipboard.writeText(value);
    message.value = "Copied to clipboard.";
  });

  return (
    <section class="settings-resource-panel">
      <div class="settings-resource-panel__header">
        <strong>OAuth applications</strong>
        <div class="settings-resource-panel__actions">
          <button
            class="settings-resource-panel__secondary-button"
            type="button"
            onClick$={loadApplications}
          >
            Refresh
          </button>
          <button
            class="settings-resource-panel__primary-button"
            type="button"
            onClick$={() => {
              isCreateOpen.value = true;
            }}
          >
            New application
          </button>
        </div>
      </div>
      {message.value ? (
        <div class="settings-resource-panel__message">{message.value}</div>
      ) : null}
      <div class="settings-resource-panel__body">
        {applications.value.length === 0 ? (
          <div class="settings-resource-panel__empty">
            No OAuth applications yet.
          </div>
        ) : (
          applications.value.map((application) => (
            <article class="settings-resource-item" key={application.id}>
              <div class="oauth-panel__application-header">
                <div>
                  <strong>{application.name}</strong>
                  <p class="oauth-panel__subtle">{application.redirect_uri}</p>
                </div>
                <button
                  class="settings-resource-panel__secondary-button"
                  type="button"
                  onClick$={() => {
                    activeApplication.value = application;
                  }}
                >
                  Manage
                </button>
              </div>
              <span class="oauth-panel__subtle">
                Scopes: {application.scopes.join(", ")}
              </span>
            </article>
          ))
        )}
      </div>

      <Drawer
        isOpen={isCreateOpen.value}
        onClose$={$(() => {
          isCreateOpen.value = false;
        })}
        title="New OAuth application"
      >
        <form
          class="settings-drawer-form"
          onSubmit$={createApplication}
          preventdefault:submit
        >
          <label class="settings-drawer-form__label">
            Name
            <input
              class="settings-drawer-form__input"
              name="name"
              placeholder="Dokploy"
              required
            />
          </label>
          <label class="settings-drawer-form__label">
            Redirect URI
            <input
              class="settings-drawer-form__input"
              name="redirectUri"
              placeholder="https://your-dokploy-domain.com/api/providers/gitlab/callback"
              required
            />
          </label>
          <label class="settings-drawer-form__label">
            Scopes
            <input
              class="settings-drawer-form__input"
              name="scopes"
              value="api read_user read_repository"
            />
          </label>
          <button class="settings-resource-panel__primary-button" type="submit">
            Create application
          </button>
        </form>
      </Drawer>

      <Drawer
        isOpen={activeApplication.value !== null}
        onClose$={$(() => {
          activeApplication.value = null;
        })}
        title={activeApplication.value?.name ?? "OAuth application"}
      >
        {activeApplication.value ? (
          <div class="oauth-panel__details">
            <InfoRow
              label="Application ID"
              value={activeApplication.value.client_id}
              onCopy$={() => copy(activeApplication.value!.client_id)}
            />
            <InfoRow
              label="Redirect URI"
              value={activeApplication.value.redirect_uri}
              onCopy$={() => copy(activeApplication.value!.redirect_uri)}
            />
            {revealedSecret.value ? (
              <InfoRow
                label="Application Secret"
                value={revealedSecret.value}
                onCopy$={() => copy(revealedSecret.value!)}
              />
            ) : null}
            <div class="oauth-panel__hint">
              <p class="oauth-panel__hint-title">Dokploy setup</p>
              <p class="oauth-panel__subtle">
                Use this Diggit server as Dokploy&apos;s Gitlab URL, then paste
                the Application ID and Secret above.
              </p>
            </div>
            <div class="oauth-panel__actions">
              <button
                class="settings-resource-panel__secondary-button"
                type="button"
                onClick$={() => rotateSecret(activeApplication.value!)}
              >
                Rotate secret
              </button>
              <button
                class="oauth-panel__danger-button"
                type="button"
                onClick$={() => deleteApplication(activeApplication.value!)}
              >
                Delete application
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </section>
  );
});

type InfoRowProps = {
  label: string;
  onCopy$: PropFunction<() => void>;
  value: string;
};

const InfoRow = component$(({ label, onCopy$, value }: InfoRowProps) => {
  return (
    <div class="oauth-panel__info-row">
      <span class="oauth-panel__info-label">{label}</span>
      <code class="oauth-panel__info-value">{value}</code>
      <button
        class="settings-resource-panel__secondary-button"
        type="button"
        onClick$={onCopy$}
      >
        Copy
      </button>
    </div>
  );
});
