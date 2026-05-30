"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem("diggit_token");
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function CreateRepoForm({ initialOwner = "" }: { initialOwner?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/repos`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        name: form.get("name"),
        owner: form.get("owner") || undefined,
        description: form.get("description"),
        visibility: form.get("visibility"),
      }),
    });
    if (response.ok) {
      const repo = (await response.json()) as { owner_handle: string; name: string };
      router.push(`/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`);
      return;
    }
    setMessage(`Failed: ${response.status}`);
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Create repository</h2>
      <label className="grid gap-1.5">
        Name
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="name" required />
      </label>
      <label className="grid gap-1.5">
        Owner
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="owner" defaultValue={initialOwner} placeholder="Leave blank for your user, or enter an organization" />
      </label>
      <label className="grid gap-1.5">
        Description
        <textarea className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="description" rows={3} />
      </label>
      <label className="grid gap-1.5">
        Visibility
        <select className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="visibility" defaultValue="public">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Create
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
}

export function ForkRepoForm({ owner, name }: { owner: string; name: string }) {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `${API_URL}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/fork`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ name: form.get("name") || undefined }),
      },
    );
    setMessage(response.ok ? "Fork created and federation activity queued." : `Failed: ${response.status}`);
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Fork repository</h2>
      <label className="grid gap-1.5">
        Fork name
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="name" placeholder={name} />
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Fork
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
}

export function PullRequestForm({ owner, name, redirectTo }: { owner: string; name: string; redirectTo?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `${API_URL}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          title: form.get("title"),
          body: form.get("body"),
          source_repo_url: form.get("sourceRepoUrl"),
          source_branch: form.get("sourceBranch"),
          target_branch: form.get("targetBranch"),
        }),
      },
    );
    if (response.ok) {
      setMessage("Pull request opened and activity queued.");
      if (redirectTo) {
        router.push(redirectTo);
      }
      return;
    }

    setMessage(`Failed: ${response.status}`);
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Open federated pull request</h2>
      <label className="grid gap-1.5">
        Title
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="title" required />
      </label>
      <label className="grid gap-1.5">
        Source repo URL
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="sourceRepoUrl" required />
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <label className="grid gap-1.5">
          Source branch
          <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="sourceBranch" defaultValue="main" required />
        </label>
        <label className="grid gap-1.5">
          Target branch
          <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="targetBranch" defaultValue="main" />
        </label>
      </div>
      <label className="grid gap-1.5">
        Body
        <textarea className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="body" rows={4} />
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Open PR
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
}
