import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import { Drawer } from "~/components/ui/Drawer";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

const WEBHOOK_TRIGGER_OPTIONS = [
  { description: "Branch push events.", label: "Push events", value: "push" },
  { description: "Tag creation or update events.", label: "Tag push events", value: "tag_push" },
  { description: "Issue creation and updates.", label: "Issues events", value: "issues" },
  { description: "Confidential issue activity.", label: "Confidential issues events", value: "confidential_issues" },
  { description: "Merge request activity.", label: "Merge request events", value: "merge_requests" },
  { description: "Comments and notes.", label: "Note events", value: "note" },
  { description: "Confidential comments and notes.", label: "Confidential note events", value: "confidential_note" },
  { description: "CI job activity.", label: "Job events", value: "job" },
  { description: "Pipeline activity.", label: "Pipeline events", value: "pipeline" },
  { description: "Wiki page activity.", label: "Wiki page events", value: "wiki_page" },
  { description: "Deployment activity.", label: "Deployment events", value: "deployment" },
  { description: "Release activity.", label: "Release events", value: "releases" },
  { description: "Resource access token activity.", label: "Resource access token events", value: "resource_access_token" },
  { description: "Repository update events.", label: "Repository update events", value: "repository_update" },
  { description: "Emoji reaction activity.", label: "Emoji events", value: "emoji" },
] as const;

type RepositoryWebhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  push_events_branch_filter: string | null;
  branch_filter_strategy: string | null;
  last_status: string | null;
  last_status_code: number | null;
  last_error: string | null;
  last_delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

type RepositoryWebhooksPanelProps = {
  name: string;
  owner: string;
};

export const RepositoryWebhooksPanel = component$(
  ({ name, owner }: RepositoryWebhooksPanelProps) => {
    const webhooks = useSignal<RepositoryWebhook[]>([]);
    const isCreateOpen = useSignal(false);
    const message = useSignal("");
    const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

    const loadWebhooks = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to manage repository webhooks.";
        return;
      }

      const response = await fetch(`${publicApiBaseUrl()}${repoPath}/webhooks`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        message.value = `Failed to load webhooks: ${response.status}`;
        return;
      }
      const body = (await response.json()) as { data: RepositoryWebhook[] };
      webhooks.value = body.data;
      message.value = "";
    });

    useTask$(async () => {
      if (!isBrowser) {
        return;
      }
      await loadWebhooks();
    });

    const createWebhook = $(async (
      _event: SubmitEvent,
      formElement: HTMLFormElement,
    ) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to manage repository webhooks.";
        return;
      }

      const form = new FormData(formElement);
      const events = selectedWebhookEvents(form);
      const response = await fetch(`${publicApiBaseUrl()}${repoPath}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: form.get("url"),
          secret: form.get("secret") || null,
          events,
          push_events_branch_filter: form.get("push_events_branch_filter") || null,
          branch_filter_strategy: form.get("branch_filter_strategy") || "wildcard",
        }),
      });
      if (!response.ok) {
        message.value = `Failed to create webhook: ${response.status}`;
        return;
      }
      message.value = "Webhook created.";
      formElement.reset();
      isCreateOpen.value = false;
      await loadWebhooks();
    });

    const deleteWebhook = $(async (webhook: RepositoryWebhook) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to manage repository webhooks.";
        return;
      }

      const response = await fetch(
        `${publicApiBaseUrl()}${repoPath}/webhooks/${webhook.id}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        message.value = `Failed to delete webhook: ${response.status}`;
        return;
      }
      message.value = "Webhook deleted.";
      await loadWebhooks();
    });

    const testWebhook = $(async (webhook: RepositoryWebhook) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to manage repository webhooks.";
        return;
      }

      const response = await fetch(
        `${publicApiBaseUrl()}${repoPath}/webhooks/${webhook.id}/test`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        message.value = `Failed to test webhook: ${response.status}`;
        return;
      }
      message.value = "Test payload sent.";
      await loadWebhooks();
    });

    return (
      <main class="settings-group-page">
        <section class="settings-group-page__copy">
          <h2 class="settings-group-page__title">Webhooks</h2>
          <p class="settings-group-page__description">
            Send GitLab-style push events to Dokploy deployment webhook URLs.
          </p>
        </section>

        <section class="settings-resource-panel">
          <div class="settings-resource-panel__header">
            <strong>Repository webhooks</strong>
            <div class="settings-resource-panel__actions">
              <button
                class="settings-resource-panel__secondary-button"
                type="button"
                onClick$={loadWebhooks}
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
                Add webhook
              </button>
            </div>
          </div>
          {message.value ? (
            <div class="settings-resource-panel__message">{message.value}</div>
          ) : null}
          <div class="settings-resource-panel__body">
            {webhooks.value.length === 0 ? (
              <div class="settings-resource-panel__empty">
                No webhooks loaded yet. Refresh after signing in.
              </div>
            ) : (
              webhooks.value.map((webhook) => (
                <article class="settings-resource-item" key={webhook.id}>
                  <div class="oauth-panel__application-header">
                    <div>
                      <strong class="settings-webhook__url">{webhook.url}</strong>
                      <p class="oauth-panel__subtle">
                        Events: {formatWebhookEvents(webhook.events)}
                      </p>
                      {webhook.push_events_branch_filter ? (
                        <p class="oauth-panel__subtle">
                          Branch filter: {webhook.push_events_branch_filter} (
                          {webhook.branch_filter_strategy ?? "wildcard"})
                        </p>
                      ) : null}
                    </div>
                    <div class="oauth-panel__actions">
                      <button
                        class="settings-resource-panel__secondary-button"
                        type="button"
                        onClick$={() => testWebhook(webhook)}
                      >
                        Test
                      </button>
                      <button
                        class="oauth-panel__danger-button"
                        type="button"
                        onClick$={() => deleteWebhook(webhook)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p class="oauth-panel__subtle">
                    Last delivery:{" "}
                    {webhook.last_delivered_at
                      ? `${webhook.last_status ?? "unknown"} (${webhook.last_status_code ?? "no status"})`
                      : "Never"}
                  </p>
                  {webhook.last_error ? (
                    <p class="settings-webhook__error">{webhook.last_error}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <Drawer
          isOpen={isCreateOpen.value}
          onClose$={$(() => {
            isCreateOpen.value = false;
          })}
          title="Add webhook"
        >
          <form
            class="settings-drawer-form"
            onSubmit$={createWebhook}
            preventdefault:submit
          >
            <label class="settings-drawer-form__label">
              Payload URL
              <input
                class="settings-drawer-form__input"
                name="url"
                placeholder="https://your-dokploy-domain.com/api/deploy/webhook/..."
                required
              />
            </label>
            <label class="settings-drawer-form__label">
              Secret token
              <input
                class="settings-drawer-form__input"
                name="secret"
                placeholder="Optional GitLab secret token"
              />
            </label>
            <fieldset class="settings-webhook__fieldset">
              <legend class="settings-drawer-form__heading">Trigger events</legend>
              <div class="settings-webhook__trigger-grid">
                {WEBHOOK_TRIGGER_OPTIONS.map((option) => (
                  <label class="settings-webhook__trigger" key={option.value}>
                    <input
                      defaultChecked={option.value === "push"}
                      name={option.value}
                      type="checkbox"
                    />
                    <span class="settings-webhook__trigger-copy">
                      <span class="settings-webhook__trigger-title">
                        {option.label}
                      </span>
                      <span class="settings-webhook__trigger-description">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div class="settings-webhook__filter-grid">
              <label class="settings-drawer-form__label">
                Branch filter
                <input
                  class="settings-drawer-form__input"
                  name="push_events_branch_filter"
                  placeholder="Optional, e.g. main or release/*"
                />
              </label>
              <label class="settings-drawer-form__label">
                Filter strategy
                <select
                  class="settings-drawer-form__input"
                  name="branch_filter_strategy"
                >
                  <option value="wildcard" selected>
                    Wildcard
                  </option>
                  <option value="regex">Regex</option>
                  <option value="all_branches">All branches</option>
                </select>
              </label>
            </div>
            <p class="settings-group-page__message">
              GitLab-style events are sent with `X-Gitlab-Event` and the optional
              `X-Gitlab-Token` header. Branch filters apply to push events.
            </p>
            <button class="settings-resource-panel__primary-button" type="submit">
              Add webhook
            </button>
          </form>
        </Drawer>
      </main>
    );
  },
);

function selectedWebhookEvents(form: FormData) {
  const events = WEBHOOK_TRIGGER_OPTIONS.filter(
    (option) => form.get(option.value) === "on",
  ).map((option) => option.value);
  return events.length > 0 ? events : ["push"];
}

function formatWebhookEvents(events: string[]) {
  if (events.length === 0) {
    return "None";
  }
  return events
    .map(
      (event) =>
        WEBHOOK_TRIGGER_OPTIONS.find((option) => option.value === event)?.label ??
        event,
    )
    .join(", ");
}
