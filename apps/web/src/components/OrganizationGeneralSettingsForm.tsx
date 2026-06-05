"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import type { Organization } from "@/lib/api";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_URL = apiBaseUrl();

type OrganizationGeneralSettingsFormProps = {
  organization: Organization;
};

export function OrganizationGeneralSettingsForm({ organization }: OrganizationGeneralSettingsFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(organization.display_name);
  const [description, setDescription] = useState(organization.description);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    const response = await fetch(`${API_URL}/organizations/${encodeURIComponent(organization.name)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        display_name: displayName,
        description,
      }),
    });

    setIsSaving(false);
    if (!response.ok) {
      await showError(response, "Unable to save organization settings.");
      return;
    }

    setMessage("Organization settings saved.");
    router.refresh();
  }

  async function deleteOrganization() {
    if (confirmation !== organization.name) {
      setMessage(`Type ${organization.name} to confirm deletion.`);
      return;
    }

    setIsSaving(true);
    setMessage("");
    const response = await fetch(`${API_URL}/organizations/${encodeURIComponent(organization.name)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setIsSaving(false);

    if (!response.ok) {
      await showError(response, "Unable to delete organization.");
      return;
    }

    router.push("/organizations");
    router.refresh();
  }

  async function showError(response: Response, fallback: string) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setMessage(body?.error ?? `${fallback} (${response.status})`);
  }

  return (
    <main className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">General settings</h2>
        <p className="text-[#59636e]">Control organization identity and administrative actions.</p>
      </section>

      <form className="grid gap-6" onSubmit={saveOrganization}>
        <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-5">
          <div>
            <h3 className="text-lg font-semibold">Organization profile</h3>
            <p className="text-sm text-[#59636e]">Update the public name and description for @{organization.name}.</p>
          </div>
          <label className="grid gap-2">
            <span className="font-semibold">Display name</span>
            <input
              className="max-w-md rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="font-semibold">Description</span>
            <textarea
              className="min-h-28 rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <button className="rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white disabled:opacity-60" disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save changes"}
            </button>
            {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
          </div>
        </section>
      </form>

      <section className="rounded-md border border-[#cf222e] bg-white">
        <div className="border-b border-[#d8dee4] p-5">
          <h3 className="text-xl font-semibold text-[#cf222e]">Danger Zone</h3>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h4 className="font-semibold">Delete this organization</h4>
            <p className="text-sm text-[#59636e]">Permanently delete this organization. Repositories must be moved or deleted first.</p>
          </div>
          <button className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8]" type="button" onClick={() => setIsDeleteOpen(true)}>
            Delete this organization
          </button>
        </div>
      </section>

      <Drawer isOpen={isDeleteOpen} title="Delete organization" onClose={() => setIsDeleteOpen(false)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">Type {organization.name} to confirm deletion.</p>
          <input
            className="max-w-sm rounded-md border border-[#d0d7de] bg-white px-3 py-2"
            placeholder={organization.name}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <button
            className="w-fit rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8] disabled:opacity-60"
            disabled={isSaving}
            type="button"
            onClick={deleteOrganization}
          >
            {isSaving ? "Deleting..." : "Delete organization"}
          </button>
        </div>
      </Drawer>
    </main>
  );
}
