"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders, getAuthToken } from "@/lib/auth-session";
import type { RunnerSecret, RunnerVariable } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useEffect, useState } from "react";

const API_URL = apiBaseUrl();

type SecretsVariablesPanelProps = {
  scopeLabel: "repository" | "organization";
  secrets: RunnerSecret[];
  variables: RunnerVariable[];
  secretsPath: string;
  variablesPath: string;
};

type DrawerMode = "secret" | "variable" | null;

export function SecretsVariablesPanel({ scopeLabel, secrets, secretsPath, variables, variablesPath }: SecretsVariablesPanelProps) {
  const [secretsState, setSecretsState] = useState(secrets);
  const [variablesState, setVariablesState] = useState(variables);
  const [mode, setMode] = useState<DrawerMode>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [environment, setEnvironment] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const scopeTitle = scopeLabel[0].toUpperCase() + scopeLabel.slice(1);
  const environmentSecrets = secretsState.filter((secret) => secret.environment);
  const scopedSecrets = secretsState.filter((secret) => !secret.environment);
  const environmentVariables = variablesState.filter((variable) => variable.environment);
  const scopedVariables = variablesState.filter((variable) => !variable.environment);

  async function loadConfigs() {
    const [secretsResponse, variablesResponse] = await Promise.all([
      fetch(`${API_URL}${secretsPath}`, { headers: authHeaders() }),
      fetch(`${API_URL}${variablesPath}`, { headers: authHeaders() }),
    ]);

    if (!secretsResponse.ok || !variablesResponse.ok) {
      const status = !secretsResponse.ok ? secretsResponse.status : variablesResponse.status;
      setMessage(`Failed to load ${scopeLabel} configuration. (${status})`);
      return;
    }

    const [nextSecrets, nextVariables] = (await Promise.all([
      secretsResponse.json(),
      variablesResponse.json(),
    ])) as [{ data: RunnerSecret[] }, { data: RunnerVariable[] }];

    setSecretsState(nextSecrets.data);
    setVariablesState(nextVariables.data);
  }

  useEffect(() => {
    if ((secrets.length > 0 || variables.length > 0) || !getAuthToken()) {
      return;
    }
    void loadConfigs();
  }, [secrets.length, variables.length]);

  async function submitConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = mode === "secret" ? secretsPath : variablesPath;
    setIsSaving(true);
    setMessage("");

    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        name,
        value,
        environment: environment || null,
      }),
    });

    setIsSaving(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? `Failed to save ${mode}.`);
      return;
    }

    setName("");
    setValue("");
    setEnvironment("");
    setMode(null);
    await loadConfigs();
  }

  return (
    <main className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Secrets and variables</h2>
        <p className="text-[#59636e]">Configure runner secrets and environment variables for this {scopeLabel}.</p>
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <Header title="Environment secrets" action="New secret" onClick={() => setMode("secret")} />
        <ConfigList emptyText="This environment has no secrets." items={environmentSecrets} />
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <Header title={`${scopeTitle} secrets`} action="New secret" onClick={() => setMode("secret")} />
        <ConfigList emptyText={`This ${scopeLabel} has no secrets.`} items={scopedSecrets} />
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <Header title="Environment variables" action="New variable" onClick={() => setMode("variable")} />
        <ConfigList emptyText="This environment has no variables." items={environmentVariables} showValue />
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <Header title={`${scopeTitle} variables`} action="New variable" onClick={() => setMode("variable")} />
        <ConfigList emptyText={`This ${scopeLabel} has no variables.`} items={scopedVariables} showValue />
      </section>

      <Drawer isOpen={mode !== null} title={mode === "secret" ? "New secret" : "New variable"} onClose={() => setMode(null)}>
        <form className="grid gap-4" onSubmit={submitConfig}>
          <label className="grid gap-2">
            <span className="font-semibold">Name</span>
            <input
              className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              placeholder="DEPLOY_TOKEN"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="font-semibold">Value</span>
            <textarea
              className="min-h-28 rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="font-semibold">Environment</span>
            <input
              className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              placeholder="Optional, for example production"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <button className="w-fit rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white disabled:opacity-60" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save"}
            </button>
            {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
          </div>
        </form>
      </Drawer>
    </main>
  );
}

function Header({ action, onClick, title }: { action: string; onClick: () => void; title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] bg-[#f6f8fa] px-5 py-3">
      <h3 className="font-semibold">{title}</h3>
      <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function ConfigList({ emptyText, items, showValue = false }: { emptyText: string; items: Array<RunnerSecret | RunnerVariable>; showValue?: boolean }) {
  if (items.length === 0) {
    return <p className="p-5 text-[#59636e]">{emptyText}</p>;
  }

  return (
    <div className="grid">
      {items.map((item) => (
        <article className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] p-5 last:border-b-0" key={item.id}>
          <div>
            <h4 className="font-mono font-semibold">{item.name}</h4>
            <p className="text-sm text-[#59636e]">{item.environment ? `Environment: ${item.environment}` : "No environment"}</p>
          </div>
          {showValue && "value" in item ? <span className="max-w-md truncate font-mono text-sm text-[#59636e]">{item.value}</span> : null}
        </article>
      ))}
    </div>
  );
}
