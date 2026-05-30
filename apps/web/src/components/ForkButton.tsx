"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ForkButtonProps = {
  owner: string;
  name: string;
  initialForks: number;
};

export function ForkButton({ owner, name, initialForks }: ForkButtonProps) {
  const router = useRouter();
  const [forks, setForks] = useState(initialForks);
  const [message, setMessage] = useState("");

  async function fork() {
    const token = window.localStorage.getItem("diggit_token");
    if (!token) {
      setMessage("Sign in to fork");
      return;
    }

    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/fork`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    const forkedRepo = (await response.json()) as { owner_handle: string; name: string };
    setForks((value) => value + 1);
    setMessage("");
    router.push(`/${encodeURIComponent(forkedRepo.owner_handle)}/${encodeURIComponent(forkedRepo.name)}`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className="cursor-pointer rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 font-semibold hover:border-[#0969da] hover:text-[#0969da]"
        type="button"
        onClick={fork}
      >
        Fork
      </button>
      <span className="text-[#59636e]">{forks}</span>
      {message ? <span className="text-xs text-[#59636e]">{message}</span> : null}
    </div>
  );
}
