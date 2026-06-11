"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import { useState } from "react";
import { getAuthToken } from "@/lib/auth-session";
import { Star } from "lucide-react";

const API_URL = apiBaseUrl();

type StarButtonProps = {
  owner: string;
  name: string;
  initialStars: number;
  initialStarred?: boolean;
};

export function StarButton({ owner, name, initialStars, initialStarred = false }: StarButtonProps) {
  const [stars, setStars] = useState(initialStars);
  const [starred, setStarred] = useState(initialStarred);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleStar() {
    const token = getAuthToken();
    if (!token) {
      setMessage("Sign in to star");
      return;
    }

    setIsSubmitting(true);
    const nextStarred = !starred;

    try {
      const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/star`, {
        method: nextStarred ? "POST" : "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setMessage(`Failed: ${response.status}`);
        return;
      }

      const repo = (await response.json()) as { stars_count: number; viewer_has_starred?: boolean };
      setStars(repo.stars_count);
      setStarred(repo.viewer_has_starred ?? nextStarred);
      setMessage("");
    } catch {
      setMessage("Failed to update star");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={`inline-flex h-9 overflow-hidden rounded-full border bg-white shadow-sm transition ${
          starred
            ? "border-[#fd8c73]"
            : "border-[#d0d7de] hover:border-[#0969da]"
        }`}
      >
        <button
          className={`inline-flex cursor-pointer items-center gap-2 px-3 text-sm font-semibold transition ${
            starred
              ? "bg-[#fff8f8] text-[#1f2328] hover:bg-[#f6f8fa]"
              : "bg-white text-[#1f2328] hover:bg-[#ddf4ff] hover:text-[#0969da]"
          }`}
          disabled={isSubmitting}
          type="button"
          onClick={toggleStar}
        >
          <Star
            aria-hidden="true"
            className={starred ? "fill-[#fd8c73] text-[#fd8c73]" : "text-[#59636e]"}
            size={16}
          />
          <span>{starred ? "Starred" : "Star"}</span>
        </button>
        <span className="grid min-w-10 place-items-center border-l border-[#d0d7de] bg-[#f6f8fa] px-3 text-sm font-semibold text-[#59636e]">
          {stars}
        </span>
      </div>
      {message ? <span className="text-xs text-[#59636e]">{message}</span> : null}
    </div>
  );
}
