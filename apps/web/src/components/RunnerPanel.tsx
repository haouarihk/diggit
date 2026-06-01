"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/auth-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Runner = {
  id: string;
  name: string;
  labels: string[];
  scope_kind: string;
  status: string;
  last_seen_at: string | null;
};

type RunnerPanelProps = {
  scopeLabel: string;
  listPath: string;
  tokenPath: string;
};

export function RunnerPanel({ scopeLabel, listPath, tokenPath }: RunnerPanelProps) {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [registrationToken, setRegistrationToken] = useState("");
  const [message, setMessage] = useState("");

  async function loadRunners() {
    const response = await fetch(`${API_URL}${listPath}`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load runners: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: Runner[] };
    setRunners(body.data);
  }

  async function generateToken() {
    const response = await fetch(`${API_URL}${tokenPath}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to generate token: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { token: string };
    setRegistrationToken(body.token);
  }

  const command = `./act_runner register --no-interactive --instance ${API_URL} --token ${registrationToken || "<registration_token>"} --name ${scopeLabel.toLowerCase().replaceAll(" ", "-")}-runner --labels ubuntu-latest:docker://node:20-bookworm`;
  const dockerCommand = `docker run -e GITEA_INSTANCE_URL=${API_URL} -e GITEA_RUNNER_REGISTRATION_TOKEN=${registrationToken || "<registration_token>"} -e GITEA_RUNNER_LABELS=ubuntu-latest:docker://node:20-bookworm gitea/act_runner:latest`;

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
        <strong>{scopeLabel} runners</strong>
        <div className="flex gap-2">
          <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void loadRunners()}>
            Refresh
          </button>
          <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => void generateToken()}>
            New runner token
          </button>
        </div>
      </div>
      {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
      {registrationToken ? (
        <div className="grid gap-3 border-b border-[#d8dee4] p-4">
          <p className="text-[#59636e]">
            Register a Gitea-compatible act_runner with this token. Keep the generated `.runner` file and token private.
          </p>
          <div className="break-all rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-2 font-mono">{registrationToken}</div>
          <div>
            <strong>Binary setup</strong>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-[#0d1117] p-3 font-mono text-[#f0f6fc]">{command}</pre>
          </div>
          <div>
            <strong>Docker setup</strong>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-[#0d1117] p-3 font-mono text-[#f0f6fc]">{dockerCommand}</pre>
          </div>
        </div>
      ) : null}
      {runners.length === 0 ? (
        <div className="p-4 text-[#59636e]">No runners loaded yet.</div>
      ) : (
        <div className="grid">
          {runners.map((runner) => (
            <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={runner.id}>
              <div className="flex flex-wrap items-center gap-2.5">
                <strong>{runner.name}</strong>
                <span className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">{runner.status}</span>
                <span className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">{runner.scope_kind}</span>
              </div>
              <p className="text-[#59636e]">Labels: {runner.labels.join(", ") || "none"}</p>
              <p className="text-[#59636e]">Last seen: {runner.last_seen_at ?? "never"}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
