"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type FileDeleteButtonProps = {
  name: string;
  owner: string;
  path: string;
  redirectTo: string;
  variant?: "danger" | "quiet";
};

export function FileDeleteButton({
  name,
  owner,
  path,
  redirectTo,
  variant = "quiet",
}: FileDeleteButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function deletePath() {
    const token = window.localStorage.getItem("diggit_token");
    if (!token) {
      setMessage("Sign in to delete");
      return;
    }

    const confirmed = window.confirm(`Delete ${path}? This will create a commit.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setMessage("");

    const params = new URLSearchParams({ path });
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${params.toString()}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );

    setIsDeleting(false);

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className={
          variant === "danger"
            ? "cursor-pointer rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8]"
            : "cursor-pointer rounded-md border border-[#d0d7de] bg-white px-2.5 py-1 text-xs font-semibold text-[#cf222e] hover:bg-[#fff8f8]"
        }
        disabled={isDeleting}
        type="button"
        onClick={deletePath}
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
      {message ? <span className="text-xs text-[#59636e]">{message}</span> : null}
    </div>
  );
}
