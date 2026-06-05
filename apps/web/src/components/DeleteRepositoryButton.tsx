"use client";

import { getAuthToken } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = apiBaseUrl();

type DeleteRepositoryButtonProps = {
  name: string;
  owner: string;
  redirectTo: string;
};

export function DeleteRepositoryButton({ name, owner, redirectTo }: DeleteRepositoryButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteRepository() {
    const token = getAuthToken();
    if (!token) {
      setMessage("Sign in to delete this repository.");
      return;
    }

    const confirmation = window.prompt(`Type ${owner}/${name} to confirm deletion.`);
    if (confirmation !== `${owner}/${name}`) {
      setMessage("Repository deletion was not confirmed.");
      return;
    }

    setIsDeleting(true);
    setMessage("");

    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    setIsDeleting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? `Failed: ${response.status}`);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <button
        className="w-fit cursor-pointer rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDeleting}
        type="button"
        onClick={deleteRepository}
      >
        {isDeleting ? "Deleting..." : "Delete repository"}
      </button>
      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
    </div>
  );
}
