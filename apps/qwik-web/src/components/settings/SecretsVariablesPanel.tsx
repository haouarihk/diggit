import {
  $,
  type PropFunction,
  component$,
  isBrowser,
  useSignal,
  useTask$,
} from "@builder.io/qwik";
import { Drawer } from "~/components/ui/Drawer";
import type { RunnerSecret, RunnerVariable } from "~/lib/api";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type SecretsVariablesPanelProps = {
  scopeLabel: "organization" | "repository";
  secrets: RunnerSecret[];
  secretsPath: string;
  variables: RunnerVariable[];
  variablesPath: string;
};

type DrawerMode = "secret" | "variable" | null;

export const SecretsVariablesPanel = component$(
  ({
    scopeLabel,
    secrets,
    secretsPath,
    variables,
    variablesPath,
  }: SecretsVariablesPanelProps) => {
    const secretsState = useSignal(secrets);
    const variablesState = useSignal(variables);
    const mode = useSignal<DrawerMode>(null);
    const name = useSignal("");
    const value = useSignal("");
    const environment = useSignal("");
    const message = useSignal("");
    const isSaving = useSignal(false);

    const scopeTitle = `${scopeLabel[0].toUpperCase()}${scopeLabel.slice(1)}`;
    const environmentSecrets = secretsState.value.filter((secret) => secret.environment);
    const scopedSecrets = secretsState.value.filter((secret) => !secret.environment);
    const environmentVariables = variablesState.value.filter(
      (variable) => variable.environment,
    );
    const scopedVariables = variablesState.value.filter((variable) => !variable.environment);

    const loadConfigs = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = `Sign in to manage ${scopeLabel} secrets and variables.`;
        return;
      }

      const [secretsResponse, variablesResponse] = await Promise.all([
        fetch(`${publicApiBaseUrl()}${secretsPath}`, {
          headers: { authorization: `Bearer ${token}` },
        }),
        fetch(`${publicApiBaseUrl()}${variablesPath}`, {
          headers: { authorization: `Bearer ${token}` },
        }),
      ]);

      if (!secretsResponse.ok || !variablesResponse.ok) {
        const status = !secretsResponse.ok
          ? secretsResponse.status
          : variablesResponse.status;
        message.value = `Failed to load ${scopeLabel} configuration. (${status})`;
        return;
      }

      const [nextSecrets, nextVariables] = (await Promise.all([
        secretsResponse.json(),
        variablesResponse.json(),
      ])) as [{ data: RunnerSecret[] }, { data: RunnerVariable[] }];

      secretsState.value = nextSecrets.data;
      variablesState.value = nextVariables.data;
      message.value = "";
    });

    useTask$(async () => {
      if (!isBrowser) {
        return;
      }
      if (secrets.length > 0 || variables.length > 0) {
        return;
      }
      await loadConfigs();
    });

    const submitConfig = $(async () => {
      const token = getAuthToken();
      if (!token || !mode.value) {
        message.value = `Sign in to manage ${scopeLabel} secrets and variables.`;
        return;
      }

      const path = mode.value === "secret" ? secretsPath : variablesPath;
      isSaving.value = true;
      message.value = "";

      const response = await fetch(`${publicApiBaseUrl()}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.value,
          value: value.value,
          environment: environment.value || null,
        }),
      });

      isSaving.value = false;
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        message.value = body?.error ?? `Failed to save ${mode.value}.`;
        return;
      }

      name.value = "";
      value.value = "";
      environment.value = "";
      mode.value = null;
      await loadConfigs();
    });

    return (
      <main class="settings-group-page">
        <section class="settings-group-page__copy">
          <h2 class="settings-group-page__title">Secrets and variables</h2>
          <p class="settings-group-page__description">
            Configure runner secrets and environment variables for this{" "}
            {scopeLabel}.
          </p>
        </section>

        <section class="settings-resource-panel">
          <Header
            action="New secret"
            onClick$={$(() => {
              mode.value = "secret";
            })}
            title="Environment secrets"
          />
          <ConfigList
            emptyText="This environment has no secrets."
            items={environmentSecrets}
          />
        </section>

        <section class="settings-resource-panel">
          <Header
            action="New secret"
            onClick$={$(() => {
              mode.value = "secret";
            })}
            title={`${scopeTitle} secrets`}
          />
          <ConfigList
            emptyText={`This ${scopeLabel} has no secrets.`}
            items={scopedSecrets}
          />
        </section>

        <section class="settings-resource-panel">
          <Header
            action="New variable"
            onClick$={$(() => {
              mode.value = "variable";
            })}
            title="Environment variables"
          />
          <ConfigList
            emptyText="This environment has no variables."
            items={environmentVariables}
            showValue
          />
        </section>

        <section class="settings-resource-panel">
          <Header
            action="New variable"
            onClick$={$(() => {
              mode.value = "variable";
            })}
            title={`${scopeTitle} variables`}
          />
          <ConfigList
            emptyText={`This ${scopeLabel} has no variables.`}
            items={scopedVariables}
            showValue
          />
        </section>

        <Drawer
          isOpen={mode.value !== null}
          onClose$={$(() => {
            mode.value = null;
          })}
          title={mode.value === "secret" ? "New secret" : "New variable"}
        >
          <div class="settings-drawer-form">
            <label class="settings-drawer-form__label">
              <span class="settings-drawer-form__heading">Name</span>
              <input
                class="settings-drawer-form__input"
                placeholder="DEPLOY_TOKEN"
                required
                value={name.value}
                onInput$={(event) => {
                  name.value = (event.target as HTMLInputElement).value;
                }}
              />
            </label>
            <label class="settings-drawer-form__label">
              <span class="settings-drawer-form__heading">Value</span>
              <textarea
                class="settings-drawer-form__textarea settings-drawer-form__textarea--plain"
                required
                value={value.value}
                onInput$={(event) => {
                  value.value = (event.target as HTMLTextAreaElement).value;
                }}
              />
            </label>
            <label class="settings-drawer-form__label">
              <span class="settings-drawer-form__heading">Environment</span>
              <input
                class="settings-drawer-form__input"
                placeholder="Optional, for example production"
                value={environment.value}
                onInput$={(event) => {
                  environment.value = (event.target as HTMLInputElement).value;
                }}
              />
            </label>
            <div class="settings-group-page__actions">
              <button
                class="settings-resource-panel__primary-button"
                disabled={isSaving.value}
                type="button"
                onClick$={submitConfig}
              >
                {isSaving.value ? "Saving..." : "Save"}
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

const Header = component$(
  ({
    action,
    onClick$,
    title,
  }: {
    action: string;
    onClick$: PropFunction<() => void>;
    title: string;
  }) => {
    return (
      <div class="settings-resource-panel__header">
        <h3>{title}</h3>
        <button
          class="settings-resource-panel__secondary-button"
          type="button"
          onClick$={onClick$}
        >
          {action}
        </button>
      </div>
    );
  },
);

const ConfigList = component$(
  ({
    emptyText,
    items,
    showValue = false,
  }: {
    emptyText: string;
    items: Array<RunnerSecret | RunnerVariable>;
    showValue?: boolean;
  }) => {
    if (items.length === 0) {
      return <p class="settings-resource-panel__empty">{emptyText}</p>;
    }

    return (
      <div class="settings-resource-panel__body">
        {items.map((item) => (
          <article class="settings-resource-item settings-config-item" key={item.id}>
            <div>
              <h4 class="settings-config-item__title">{item.name}</h4>
              <p class="settings-config-item__environment">
                {item.environment
                  ? `Environment: ${item.environment}`
                  : "No environment"}
              </p>
            </div>
            {showValue && "value" in item ? (
              <span class="settings-config-item__value">{item.value}</span>
            ) : null}
          </article>
        ))}
      </div>
    );
  },
);
