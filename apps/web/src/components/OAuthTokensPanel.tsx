"use client";

import { authHeaders } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useState } from "react";

const API_URL = apiBaseUrl();

type OAuthToken = {
  id: string;
  application_id: string;
  application_name: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export function OAuthTokensPanel() {
  const [tokens, setTokens] = useState<OAuthToken[]>([]);
  const [message, setMessage] = useState("");

  async function loadTokens() {
    const response = await fetch(`${API_URL}/oauth/tokens`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load OAuth tokens: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: OAuthToken[] };
    setTokens(body.data);
  }

  async function revokeToken(token: OAuthToken) {
    const response = await fetch(`${API_URL}/oauth/tokens/${token.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setMessage(`Failed to revoke token: ${response.status}`);
      return;
    }
    setMessage(`Revoked ${token.application_name}.`);
    await loadTokens();
  }

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3">
        <strong>Authorized OAuth tokens</strong>
        <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => void loadTokens()}>
          Refresh
        </button>
      </div>
      {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
      <div className="grid">
        {tokens.length === 0 ? (
          <div className="p-4 text-[#59636e]">No tokens loaded yet. Refresh after signing in.</div>
        ) : (
          tokens.map((token) => (
            <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={token.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong>{token.application_name}</strong>
                  <p className="text-sm text-[#59636e]">Scopes: {token.scopes.join(", ")}</p>
                </div>
                <button
                  className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 font-semibold text-[#cf222e] disabled:opacity-50"
                  disabled={token.revoked_at !== null}
                  type="button"
                  onClick={() => void revokeToken(token)}
                >
                  {token.revoked_at ? "Revoked" : "Revoke"}
                </button>
              </div>
              <div className="grid gap-1 text-sm text-[#59636e] sm:grid-cols-3">
                <span>Created: {new Date(token.created_at).toLocaleString()}</span>
                <span>Expires: {new Date(token.expires_at).toLocaleString()}</span>
                <span>Last used: {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "Never"}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
