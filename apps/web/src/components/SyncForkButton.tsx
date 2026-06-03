"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import { useState } from "react";
import { authHeaders } from "@/lib/auth-session";
import type { RepositoryCompare } from "@/lib/api";

const API_URL = apiBaseUrl();

type SyncForkButtonProps = {
  owner: string;
  name: string;
  disabled?: boolean;
};

export function SyncForkButton({ owner, name, disabled = false }: SyncForkButtonProps) {
  const [message, setMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  async function sync() {
    setIsSyncing(true);
    setMessage("");
    const response = await fetch(`${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/sync-upstream`, {
      method: "POST",
      headers: authHeaders(),
    });
    setIsSyncing(false);

    if (!response.ok) {
      setMessage(`Sync failed: ${response.status}`);
      return;
    }

    const body = (await response.json()) as RepositoryCompare;
    setMessage(body.behind_by === 0 ? "Fork synced." : "Sync completed with remaining differences.");
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || isSyncing}
        type="button"
        onClick={sync}
      >
        {isSyncing ? "Syncing..." : "Sync fork"}
      </button>
      {message ? <span className="text-sm text-[#59636e]">{message}</span> : null}
    </div>
  );
}
