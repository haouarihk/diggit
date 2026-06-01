"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getAuthToken } from "@/lib/auth-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type FileEditorProps = {
  content: string;
  name: string;
  owner: string;
  path: string;
  redirectTo: string;
};

export function FileEditor({ content, name, owner, path, redirectTo }: FileEditorProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token) {
      setMessage("Sign in to edit");
      return;
    }

    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams({ path });

    setIsSaving(true);
    setMessage("");

    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${params.toString()}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: String(form.get("content") ?? ""),
          message: String(form.get("message") ?? "").trim() || undefined,
        }),
      },
    );

    setIsSaving(false);

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5">
        Commit message
        <input
          className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
          name="message"
          placeholder={`Update ${path}`}
        />
      </label>

      <label className="grid gap-1.5">
        File content
        <textarea
          className="min-h-[560px] w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-mono text-sm leading-6 text-[#1f2328]"
          defaultValue={content}
          name="content"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Commit changes"}
        </button>
        {message ? <span className="text-[#59636e]">{message}</span> : null}
      </div>
    </form>
  );
}
