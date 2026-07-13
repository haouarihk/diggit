"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders, getAuthToken } from "@/lib/auth-session";
import type { Collaborator } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useEffect, useState } from "react";

const API_URL = apiBaseUrl();

type CollaboratorsPanelProps = {
  addPath: string;
  collaborators: Collaborator[];
  permissionName: "permission" | "role";
  scopeLabel: string;
};

export function CollaboratorsPanel({ addPath, collaborators, permissionName, scopeLabel }: CollaboratorsPanelProps) {
  const [items, setItems] = useState(collaborators);
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [access, setAccess] = useState(permissionName === "role" ? "member" : "write");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const listPath = addPath;

  async function loadCollaborators() {
    const response = await fetch(`${API_URL}${listPath}`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Unable to load collaborators. (${response.status})`);
      return;
    }
    const body = (await response.json()) as { data: Collaborator[] };
    setItems(body.data);
  }

  useEffect(() => {
    if (collaborators.length > 0) {
      return;
    }
    if (scopeLabel === "repository" && !getAuthToken()) {
      return;
    }
    void loadCollaborators();
  }, [collaborators.length, scopeLabel]);

  async function addCollaborator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    const response = await fetch(`${API_URL}${addPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        username,
        [permissionName]: access,
      }),
    });
    setIsSaving(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Unable to save collaborator.");
      return;
    }
    setUsername("");
    setIsOpen(false);
    await loadCollaborators();
  }

  return (
    <main className="grid gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Collaborators</h2>
          <p className="text-[#59636e]">Manage who can access this {scopeLabel}.</p>
        </div>
        <button className="rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white" type="button" onClick={() => setIsOpen(true)}>
          Add collaborator
        </button>
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        {items.length === 0 ? (
          <p className="p-5 text-[#59636e]">No collaborators have been added yet.</p>
        ) : (
          <div className="grid">
            {items.map((collaborator) => (
              <article className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] p-5 last:border-b-0" key={collaborator.id}>
                <div>
                  <h3 className="font-semibold">{collaborator.display_name}</h3>
                  <p className="text-sm text-[#59636e]">@{collaborator.username}</p>
                </div>
                <span className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-sm font-semibold text-[#59636e]">
                  {collaborator[permissionName] ?? "member"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <Drawer isOpen={isOpen} title="Add collaborator" onClose={() => setIsOpen(false)}>
        <form className="grid gap-4" onSubmit={addCollaborator}>
          <label className="grid gap-2">
            <span className="font-semibold">Username</span>
            <input className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2" required value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="font-semibold">{permissionName === "role" ? "Role" : "Permission"}</span>
            <select className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2" value={access} onChange={(event) => setAccess(event.target.value)}>
              {permissionName === "role" ? (
                <>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </>
              ) : (
                <>
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                  <option value="admin">Admin</option>
                </>
              )}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button className="w-fit rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white disabled:opacity-60" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save collaborator"}
            </button>
            {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
          </div>
        </form>
      </Drawer>
    </main>
  );
}
