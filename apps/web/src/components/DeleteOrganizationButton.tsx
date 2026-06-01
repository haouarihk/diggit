"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getAuthToken } from "@/lib/auth-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type DeleteOrganizationButtonProps = {
  name: string;
};

export function DeleteOrganizationButton({ name }: DeleteOrganizationButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteOrganization() {
    const token = getAuthToken();
    if (!token) {
      setMessage("Sign in to delete this organization.");
      return;
    }

    const confirmed = window.confirm(`Delete ${name}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setMessage("");

    const response = await fetch(`${API_URL}/organizations/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    setIsDeleting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? `Failed: ${response.status}`);
      return;
    }

    router.push("/organizations");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <button
        className="w-fit cursor-pointer rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8]"
        disabled={isDeleting}
        type="button"
        onClick={deleteOrganization}
      >
        {isDeleting ? "Deleting..." : "Delete organization"}
      </button>
      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
    </div>
  );
}
