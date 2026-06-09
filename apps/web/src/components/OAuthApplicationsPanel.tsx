"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useState } from "react";

const API_URL = apiBaseUrl();

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

export function OAuthApplicationsPanel() {
  const [applications, setApplications] = useState<OAuthApplication[]>([]);
  const [activeApplication, setActiveApplication] = useState<OAuthApplication | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  async function loadApplications() {
    const response = await fetch(`${API_URL}/oauth/applications`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load OAuth applications: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: OAuthApplication[] };
    setApplications(body.data);
  }

  async function createApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scopes = String(form.get("scopes") ?? "api read_user read_repository")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
    const response = await fetch(`${API_URL}/oauth/applications`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        name: form.get("name"),
        redirect_uri: form.get("redirectUri"),
        scopes,
      }),
    });
    if (!response.ok) {
      setMessage(`Failed to create OAuth application: ${response.status}`);
      return;
    }
    const body = (await response.json()) as CreatedOAuthApplication;
    setRevealedSecret(body.client_secret);
    setActiveApplication(body.application);
    setMessage("OAuth application created. Copy the secret now; it will not be shown again.");
    formElement.reset();
    setIsCreateOpen(false);
    await loadApplications();
  }

  async function rotateSecret(application: OAuthApplication) {
    const response = await fetch(`${API_URL}/oauth/applications/${application.id}/rotate-secret`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to rotate secret: ${response.status}`);
      return;
    }
    const body = (await response.json()) as CreatedOAuthApplication;
    setRevealedSecret(body.client_secret);
    setActiveApplication(body.application);
    setMessage("Client secret rotated. Copy the new secret now.");
    await loadApplications();
  }

  async function deleteApplication(application: OAuthApplication) {
    const response = await fetch(`${API_URL}/oauth/applications/${application.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to delete application: ${response.status}`);
      return;
    }
    setActiveApplication(null);
    setMessage("OAuth application deleted and its tokens revoked.");
    await loadApplications();
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Copied to clipboard.");
  }

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
        <strong>OAuth applications</strong>
        <div className="flex gap-2">
          <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void loadApplications()}>
            Refresh
          </button>
          <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setIsCreateOpen(true)}>
            New application
          </button>
        </div>
      </div>
      {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
      <div className="grid">
        {applications.length === 0 ? (
          <div className="p-4 text-[#59636e]">No applications loaded yet. Refresh after signing in.</div>
        ) : (
          applications.map((application) => (
            <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={application.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>{application.name}</strong>
                  <p className="break-all text-sm text-[#59636e]">{application.redirect_uri}</p>
                </div>
                <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => setActiveApplication(application)}>
                  Manage
                </button>
              </div>
              <span className="text-sm text-[#59636e]">Scopes: {application.scopes.join(", ")}</span>
            </article>
          ))
        )}
      </div>

      <Drawer isOpen={isCreateOpen} title="New OAuth application" onClose={() => setIsCreateOpen(false)}>
        <form className="grid gap-4 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 sm:p-6" onSubmit={createApplication}>
          <label className="grid gap-1.5">
            Name
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="name" placeholder="Dokploy" required />
          </label>
          <label className="grid gap-1.5">
            Redirect URI
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="redirectUri" placeholder="https://panel.haouarihk.com/api/providers/gitlab/callback" required />
          </label>
          <label className="grid gap-1.5">
            Scopes
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="scopes" defaultValue="api read_user read_repository" />
          </label>
          <button className="w-fit rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
            Create application
          </button>
        </form>
      </Drawer>

      <Drawer isOpen={activeApplication !== null} title={activeApplication?.name ?? "OAuth application"} onClose={() => setActiveApplication(null)}>
        {activeApplication ? (
          <div className="grid gap-4">
            <InfoRow label="Application ID" value={activeApplication.client_id} onCopy={() => void copy(activeApplication.client_id)} />
            <InfoRow label="Redirect URI" value={activeApplication.redirect_uri} onCopy={() => void copy(activeApplication.redirect_uri)} />
            {revealedSecret ? <InfoRow label="Application Secret" value={revealedSecret} onCopy={() => void copy(revealedSecret)} /> : null}
            <div className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4">
              <p className="font-semibold">Dokploy setup</p>
              <p className="text-sm text-[#59636e]">
                Use this Diggit server as Dokploy&apos;s Gitlab URL, then paste the Application ID and Secret above.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void rotateSecret(activeApplication)}>
                Rotate secret
              </button>
              <button className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e]" type="button" onClick={() => void deleteApplication(activeApplication)}>
                Delete application
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}

function InfoRow({ label, onCopy, value }: { label: string; onCopy: () => void; value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-[#d0d7de] p-3">
      <span className="font-semibold">{label}</span>
      <code className="break-all rounded bg-[#f6f8fa] px-2 py-1 text-sm">{value}</code>
      <button className="w-fit rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={onCopy}>
        Copy
      </button>
    </div>
  );
}
