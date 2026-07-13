import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import type { Activity } from "~/lib/api";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

export const AdminActivityPanel = component$(() => {
  const activities = useSignal<Activity[]>([]);
  const message = useSignal("");

  const loadActivities = $(async () => {
    const token = getAuthToken();
    if (!token) {
      activities.value = [];
      message.value = "Sign in with an admin account to review federation activity.";
      return;
    }

    const response = await fetch(`${publicApiBaseUrl()}/activities`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      message.value = `Failed to load activity: ${response.status}`;
      return;
    }

    const body = (await response.json()) as { data: Activity[] };
    activities.value = body.data;
    message.value = "";
  });

  useTask$(async () => {
    if (!isBrowser) {
      return;
    }
    await loadActivities();
  });

  return (
    <section class="settings-resource-panel">
      <div class="settings-resource-panel__header">
        <strong>Activity log</strong>
        <button
          class="settings-resource-panel__secondary-button"
          type="button"
          onClick$={loadActivities}
        >
          Refresh
        </button>
      </div>
      {message.value ? (
        <div class="settings-resource-panel__message">{message.value}</div>
      ) : null}
      {activities.value.length === 0 ? (
        <div class="settings-resource-panel__empty">
          No federated activities yet.
        </div>
      ) : (
        <div class="settings-resource-panel__body">
          {activities.value.map((activity) => (
            <article class="settings-resource-item" key={activity.id}>
              <div class="admin-activity__meta">
                <strong>
                  {activity.activity_type} {activity.object_type}
                </strong>
                <span class="runner-panel__pill">{activity.direction}</span>
                <span class="runner-panel__pill">{activity.status}</span>
              </div>
              <p class="admin-activity__subtle">{activity.actor}</p>
              {activity.remote_server ? (
                <p class="admin-activity__subtle">
                  Remote server: {activity.remote_server}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});
