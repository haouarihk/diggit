import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import type { ServerPolicy } from "~/lib/api";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";
import { ServerPolicyForm } from "~/components/admin/ServerPolicyForm";

export const AdminServersPanel = component$(() => {
  const servers = useSignal<ServerPolicy[]>([]);
  const message = useSignal("");

  const loadServers = $(async () => {
    const token = getAuthToken();
    if (!token) {
      servers.value = [];
      message.value = "Sign in with an admin account to manage server policy.";
      return;
    }

    const response = await fetch(`${publicApiBaseUrl()}/servers`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      message.value = `Failed to load servers: ${response.status}`;
      return;
    }

    const body = (await response.json()) as { data: ServerPolicy[] };
    servers.value = body.data;
    message.value = "";
  });

  useTask$(async () => {
    if (!isBrowser) {
      return;
    }
    await loadServers();
  });

  return (
    <section class="settings-resource-panel">
      <div class="settings-resource-panel__header">
        <strong>Known servers</strong>
        <details class="admin-servers__details" data-ui-dropdown="true">
          <summary class="settings-resource-panel__primary-button">
            New policy
          </summary>
          <div class="admin-servers__popover">
            <ServerPolicyForm
              onSaved$={$(() => {
                return loadServers();
              })}
            />
          </div>
        </details>
      </div>
      {message.value ? (
        <div class="settings-resource-panel__message">{message.value}</div>
      ) : null}
      {servers.value.length === 0 ? (
        <div class="settings-resource-panel__empty">
          No federated servers recorded yet.
        </div>
      ) : (
        <div class="settings-resource-panel__body">
          {servers.value.map((server) => (
            <article class="settings-resource-item" key={server.id}>
              <div class="admin-activity__meta">
                <strong>{server.host}</strong>
                <span class="runner-panel__pill">{server.status}</span>
              </div>
              {server.reason ? (
                <p class="admin-activity__subtle">{server.reason}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});
