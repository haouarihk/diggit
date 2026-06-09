"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useState } from "react";

const API_URL = apiBaseUrl();

type RepositoryWebhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
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

export function RepositoryWebhooksPanel({ name, owner }: RepositoryWebhooksPanelProps) {
  const [webhooks, setWebhooks] = useState<RepositoryWebhook[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  async function loadWebhooks() {
    const response = await fetch(`${API_URL}${repoPath}/webhooks`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load webhooks: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: RepositoryWebhook[] };
    setWebhooks(body.data);
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`${API_URL}${repoPath}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        url: form.get("url"),
        secret: form.get("secret") || null,
        events: ["push"],
      }),
    });
    if (!response.ok) {
      setMessage(`Failed to create webhook: ${response.status}`);
      return;
    }
    setMessage("Webhook created.");
    formElement.reset();
    setIsCreateOpen(false);
    await loadWebhooks();
  }

  async function deleteWebhook(webhook: RepositoryWebhook) {
    const response = await fetch(`${API_URL}${repoPath}/webhooks/${webhook.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to delete webhook: ${response.status}`);
      return;
    }
    setMessage("Webhook deleted.");
    await loadWebhooks();
  }

  async function testWebhook(webhook: RepositoryWebhook) {
    const response = await fetch(`${API_URL}${repoPath}/webhooks/${webhook.id}/test`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to test webhook: ${response.status}`);
      return;
    }
    setMessage("Test payload sent.");
    await loadWebhooks();
  }

  return (
    <main className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Webhooks</h2>
        <p className="text-[#59636e]">Send GitLab-style push events to Dokploy deployment webhook URLs.</p>
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
          <strong>Repository webhooks</strong>
          <div className="flex gap-2">
            <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void loadWebhooks()}>
              Refresh
            </button>
            <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setIsCreateOpen(true)}>
              Add webhook
            </button>
          </div>
        </div>
        {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
        <div className="grid">
          {webhooks.length === 0 ? (
            <div className="p-4 text-[#59636e]">No webhooks loaded yet. Refresh after signing in.</div>
          ) : (
            webhooks.map((webhook) => (
              <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={webhook.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong className="break-all">{webhook.url}</strong>
                    <p className="text-sm text-[#59636e]">Events: {webhook.events.join(", ")}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void testWebhook(webhook)}>
                      Test
                    </button>
                    <button className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e]" type="button" onClick={() => void deleteWebhook(webhook)}>
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[#59636e]">
                  Last delivery: {webhook.last_delivered_at ? `${webhook.last_status ?? "unknown"} (${webhook.last_status_code ?? "no status"})` : "Never"}
                </p>
                {webhook.last_error ? <p className="text-sm text-[#cf222e]">{webhook.last_error}</p> : null}
              </article>
            ))
          )}
        </div>
      </section>

      <Drawer isOpen={isCreateOpen} title="Add webhook" onClose={() => setIsCreateOpen(false)}>
        <form className="grid gap-4 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 sm:p-6" onSubmit={createWebhook}>
          <label className="grid gap-1.5">
            Payload URL
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="url" placeholder="https://your-dokploy-domain.com/api/deploy/webhook/..." required />
          </label>
          <label className="grid gap-1.5">
            Secret token
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="secret" placeholder="Optional GitLab secret token" />
          </label>
          <p className="text-sm text-[#59636e]">Push events are sent with `X-Gitlab-Event: Push Hook` and the optional `X-Gitlab-Token` header.</p>
          <button className="w-fit rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
            Add webhook
          </button>
        </form>
      </Drawer>
    </main>
  );
}
