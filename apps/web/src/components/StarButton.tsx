"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import { useState } from "react";
import { getAuthToken } from "@/lib/auth-session";

const API_URL = apiBaseUrl();

type StarButtonProps = {
  owner: string;
  name: string;
  initialStars: number;
};

export function StarButton({ owner, name, initialStars }: StarButtonProps) {
  const [stars, setStars] = useState(initialStars);
  const [message, setMessage] = useState("");

  async function star() {
    const token = getAuthToken();
    if (!token) {
      setMessage("Sign in to star");
      return;
    }

    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/star`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setMessage(`Failed: ${response.status}`);
      return;
    }

    const repo = (await response.json()) as { stars_count: number };
    setStars(repo.stars_count);
    setMessage("");
  }

  return (
    <div className="flex items-center gap-2">
      <button className="cursor-pointer rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 font-semibold hover:border-[#0969da] hover:text-[#0969da]" type="button" onClick={star}>
        Star
      </button>
      <span className="text-[#59636e]">{stars}</span>
      {message ? <span className="text-xs text-[#59636e]">{message}</span> : null}
    </div>
  );
}
