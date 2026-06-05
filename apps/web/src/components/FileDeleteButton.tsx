"use client";

import { Drawer } from "@/components/Drawer";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authHeaders, getAuthToken } from "@/lib/auth-session";

const API_URL = apiBaseUrl();

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
  const [isOpen, setIsOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState(() => `Deleting ${fileName(path)}`);

  async function deletePath() {
    const token = getAuthToken();
    if (!token) {
      setMessage("Sign in to delete");
      return;
    }

    if (!commitMessage.trim()) {
      setMessage("Commit message is required.");
      return;
    }

    setIsDeleting(true);
    setMessage("");

    const params = new URLSearchParams({ path, message: commitMessage.trim() });
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${params.toString()}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      },
    );

    setIsDeleting(false);

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    setIsOpen(false);
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
        onClick={() => setIsOpen(true)}
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
      {message ? <span className="text-xs text-[#59636e]">{message}</span> : null}
      <Drawer isOpen={isOpen} title={`Delete ${fileName(path)}`} onClose={() => setIsOpen(false)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">
            Deleting <span className="font-mono text-[#1f2328]">{path}</span> will create a commit on the default branch.
          </p>
          <label className="grid gap-2">
            <span className="font-semibold">Commit message</span>
            <input
              className="max-w-xl rounded-md border border-[#d0d7de] bg-white px-3 py-2"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
            />
          </label>
          <button
            className="w-fit rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] hover:bg-[#fff8f8] disabled:opacity-60"
            disabled={isDeleting}
            type="button"
            onClick={deletePath}
          >
            {isDeleting ? "Deleting..." : "Commit deletion"}
          </button>
        </div>
      </Drawer>
    </div>
  );
}

function fileName(path: string) {
  return path.split("/").pop() || path;
}
