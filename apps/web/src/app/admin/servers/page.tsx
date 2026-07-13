"use client";

import { ServerPolicyForm } from "@/components/ServerPolicyForm";
import { authHeaders } from "@/lib/auth-session";
import type { ServerPolicy } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useEffect, useState } from "react";

const API_URL = apiBaseUrl();

export default function AdminServersPage() {
  const [servers, setServers] = useState<ServerPolicy[]>([]);
  const [message, setMessage] = useState("");

  async function loadServers() {
    const response = await fetch(`${API_URL}/servers`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load servers: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: ServerPolicy[] };
    setServers(body.data);
  }

  useEffect(() => {
    void loadServers();
  }, []);

  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">Admin / Servers</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Federated servers</h1>
        <p className="text-[#59636e]">
          Unknown servers are recorded as pending on first inbound activity. Blocked servers cannot
          create forks, pull requests, or comments.
        </p>
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
          <strong>Known servers</strong>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white">
              New policy
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-[min(360px,calc(100vw-3rem))] shadow-lg">
              <ServerPolicyForm onSaved={() => void loadServers()} />
            </div>
          </details>
        </div>
        {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
        {servers.length === 0 ? (
          <div className="p-4">
            <p className="text-[#59636e]">No federated servers recorded yet.</p>
          </div>
        ) : (
          <div className="grid">
            {servers.map((server) => (
              <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={server.id}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong>{server.host}</strong>
                  <span className="inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">{server.status}</span>
                </div>
                {server.reason ? <p className="text-[#59636e]">{server.reason}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
