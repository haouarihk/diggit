"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useEffect, useRef, useState } from "react";
import { authHeaders, getAuthToken } from "@/lib/auth-session";

const API_URL = apiBaseUrl();

type SshKey = {
  id: string;
  title: string;
  fingerprint: string;
  created_at: string;
};

export function SshKeysPanel() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [message, setMessage] = useState("");
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAddKeyOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleInputRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAddKeyOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAddKeyOpen]);

  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    void loadKeys();
  }, []);

  async function loadKeys() {
    const response = await fetch(`${API_URL}/user/keys`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load keys: ${response.status}`);
      return;
    }

    const body = (await response.json()) as { data: SshKey[] };
    setKeys(body.data);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`${API_URL}/user/keys`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        title: form.get("title"),
        public_key: form.get("publicKey"),
      }),
    });

    if (!response.ok) {
      setMessage(`Failed to add SSH key: ${response.status}`);
      return;
    }

    setMessage("SSH key added.");
    formElement.reset();
    setIsAddKeyOpen(false);
    await loadKeys();
  }

  async function removeKey(id: string) {
    await fetch(`${API_URL}/user/keys/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    await loadKeys();
  }

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
        <strong>SSH keys</strong>
        <div className="flex gap-2">
          <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void loadKeys()}>
            Refresh
          </button>
          <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setIsAddKeyOpen(true)}>
            Add key
          </button>
        </div>
      </div>
      {isAddKeyOpen ? (
        <div aria-labelledby="add-ssh-key-title" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-white text-[#1f2328]" role="dialog">
          <div className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-6 px-6 py-6 sm:px-10">
            <div className="flex items-start justify-between gap-4 border-b border-[#d8dee4] pb-4">
              <div>
                <p className="mb-1 text-[#59636e]">SSH keys</p>
                <h2 className="text-3xl font-semibold tracking-tight" id="add-ssh-key-title">
                  Add SSH key
                </h2>
              </div>
              <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => setIsAddKeyOpen(false)}>
                Close
              </button>
            </div>
            <form className="grid gap-4 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 sm:p-6" onSubmit={submit}>
              <label className="grid gap-1.5">
                Title
                <input ref={titleInputRef} className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="title" required />
              </label>
              <label className="grid gap-1.5">
                Public key
                <textarea className="min-h-40 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-mono" name="publicKey" required />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => setIsAddKeyOpen(false)}>
                  Cancel
                </button>
                <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
                  Add key
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
      <div className="grid">
        {keys.length === 0 ? (
          <div className="p-4 text-[#59636e]">No keys loaded yet. Refresh after signing in.</div>
        ) : (
          keys.map((key) => (
            <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={key.id}>
              <strong>{key.title}</strong>
              <span className="break-all font-mono text-[#59636e]">{key.fingerprint}</span>
              <button className="w-fit rounded-md border border-black/15 bg-white px-3 py-1.5 font-bold" type="button" onClick={() => void removeKey(key.id)}>
                Delete
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
