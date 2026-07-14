import {
  $,
  component$,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type Runner = {
  id: string;
  name: string;
  labels: string[];
  scope_kind: string;
  status: string;
  last_seen_at: string | null;
};

type RunnerPanelProps = {
  listPath: string;
  scopeLabel: string;
  tokenPath: string;
};

export const RunnerPanel = component$(
  ({ listPath, scopeLabel, tokenPath }: RunnerPanelProps) => {
    const runners = useSignal<Runner[]>([]);
    const registrationToken = useSignal("");
    const message = useSignal("");

    const loadRunners = $(async () => {
      const token = getAuthToken();
      if (!token) {
        runners.value = [];
        message.value = "Sign in to manage runners.";
        return;
      }

      const response = await fetch(`${publicApiBaseUrl()}${listPath}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        message.value = `Failed to load runners: ${response.status}`;
        return;
      }
      const body = (await response.json()) as { data: Runner[] };
      runners.value = body.data;
      message.value = "";
    });

    const generateToken = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to generate runner tokens.";
        return;
      }

      const response = await fetch(`${publicApiBaseUrl()}${tokenPath}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        message.value = `Failed to generate token: ${response.status}`;
        return;
      }
      const body = (await response.json()) as { token: string };
      registrationToken.value = body.token;
      message.value = "";
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      track(() => listPath);
      if (!getAuthToken()) {
        return;
      }
      await loadRunners();
    });

    useOnWindow("diggit-auth-changed", loadRunners);

    const command = `./act_runner register --no-interactive --instance ${publicApiBaseUrl()} --token ${registrationToken.value || "<registration_token>"} --name ${scopeLabel.toLowerCase().replaceAll(" ", "-")}-runner --labels ubuntu-latest:docker://node:20-bookworm`;
    const dockerCommand = `docker run -e GITEA_INSTANCE_URL=${publicApiBaseUrl()} -e GITEA_RUNNER_REGISTRATION_TOKEN=${registrationToken.value || "<registration_token>"} -e GITEA_RUNNER_LABELS=ubuntu-latest:docker://node:20-bookworm gitea/act_runner:latest`;

    return (
      <section class="settings-resource-panel">
        <div class="settings-resource-panel__header">
          <strong>{scopeLabel} runners</strong>
          <div class="settings-resource-panel__actions">
            <button
              class="settings-resource-panel__secondary-button"
              type="button"
              onClick$={loadRunners}
            >
              Refresh
            </button>
            <button
              class="settings-resource-panel__primary-button"
              type="button"
              onClick$={generateToken}
            >
              New runner token
            </button>
          </div>
        </div>
        {message.value ? (
          <div class="settings-resource-panel__message">{message.value}</div>
        ) : null}
        {registrationToken.value ? (
          <div class="runner-panel__token-section">
            <p class="runner-panel__help">
              Register a Gitea-compatible act_runner with this token. Keep the
              generated `.runner` file and token private.
            </p>
            <div class="runner-panel__token">{registrationToken.value}</div>
            <div>
              <strong>Binary setup</strong>
              <pre class="runner-panel__command">{command}</pre>
            </div>
            <div>
              <strong>Docker setup</strong>
              <pre class="runner-panel__command">{dockerCommand}</pre>
            </div>
          </div>
        ) : null}
        {runners.value.length === 0 ? (
          <div class="settings-resource-panel__empty">No runners loaded yet.</div>
        ) : (
          <div class="settings-resource-panel__body">
            {runners.value.map((runner) => (
              <article class="settings-resource-item" key={runner.id}>
                <div class="runner-panel__meta">
                  <strong>{runner.name}</strong>
                  <span class="runner-panel__pill">{runner.status}</span>
                  <span class="runner-panel__pill">{runner.scope_kind}</span>
                </div>
                <p class="runner-panel__detail">
                  Labels: {runner.labels.join(", ") || "none"}
                </p>
                <p class="runner-panel__detail">
                  Last seen: {runner.last_seen_at ?? "never"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  },
);
