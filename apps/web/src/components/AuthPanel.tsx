"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getAuthToken,
  normalizeServerUrl,
  pkceChallenge,
  randomToken,
  setAuthSession,
  clearAuthSession,
} from "@/lib/auth-session";

const API_URL = apiBaseUrl();

type Mode = "login" | "register";

type FederatedExchangeResponse = {
  token: string;
  home_token: string;
  expires_at: string;
  user: { username: string; display_name: string; home_server: string | null };
};

export function AuthPanel() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [token, setToken] = useState<string | null>(() => (typeof window === "undefined" ? null : getAuthToken()));
  const [message, setMessage] = useState<string>("");
  const federatedClientId = searchParams.get("federated_client_id");
  const federatedRedirectUri = searchParams.get("federated_redirect_uri");
  const federatedAudience = searchParams.get("federated_audience");
  const federatedScope = searchParams.get("federated_scope");
  const federatedState = searchParams.get("federated_state");
  const federatedNonce = searchParams.get("federated_nonce");
  const federatedCodeChallenge = searchParams.get("federated_code_challenge");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  async function authorizeFederatedLogin() {
    const localToken = getAuthToken();
    if (!localToken || !federatedClientId || !federatedRedirectUri || !federatedAudience || !federatedScope || !federatedState || !federatedNonce || !federatedCodeChallenge) {
      setMessage("Sign in locally first to continue to another server.");
      return;
    }

    const response = await fetch(`${API_URL}/auth/federated/authorize`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${localToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: federatedClientId,
        redirect_uri: federatedRedirectUri,
        audience: federatedAudience,
        scope: federatedScope,
        state: federatedState,
        nonce: federatedNonce,
        code_challenge: federatedCodeChallenge,
      }),
    });
    if (!response.ok) {
      setMessage(`Federated authorization failed: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { redirect_uri: string };
    window.location.href = body.redirect_uri;
  }

  async function beginFederatedLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const homeServer = normalizeServerUrl(String(form.get("homeServer") ?? ""));
    if (!homeServer) {
      setMessage("Enter your home Diggit server.");
      return;
    }

    const verifier = randomToken();
    const challenge = await pkceChallenge(verifier);
    const nextState = randomToken();
    const nonce = randomToken();
    const redirectUri = `${window.location.origin}/auth`;
    const pending = {
      homeServer,
      verifier,
      clientId: window.location.origin,
      redirectUri,
    };
    window.sessionStorage.setItem(`diggit_federated_${nextState}`, JSON.stringify(pending));

    const params = new URLSearchParams({
      federated_client_id: window.location.origin,
      federated_redirect_uri: redirectUri,
      federated_audience: API_URL,
      federated_scope: "repo:star repo:fork repo:issue repo:comment",
      federated_state: nextState,
      federated_nonce: nonce,
      federated_code_challenge: challenge,
    });
    window.location.href = `${homeServer}/auth?${params.toString()}`;
  }

  async function finishFederatedLogin() {
    if (!code || !state) {
      return;
    }
    const rawPending = window.sessionStorage.getItem(`diggit_federated_${state}`);
    if (!rawPending) {
      setMessage("Federated login state was not found. Start again from your server.");
      return;
    }
    const pending = JSON.parse(rawPending) as {
      homeServer: string;
      verifier: string;
      clientId: string;
      redirectUri: string;
    };
    const response = await fetch(`${API_URL}/auth/federated/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        home_server: pending.homeServer,
        code,
        client_id: pending.clientId,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
      }),
    });
    if (!response.ok) {
      setMessage(`Federated login failed: ${response.status}`);
      return;
    }
    const body = (await response.json()) as FederatedExchangeResponse;
    setAuthSession({
      kind: "federated",
      token: body.token,
      homeToken: body.home_token,
      homeServer: body.user.home_server ?? pending.homeServer,
      expiresAt: body.expires_at,
    });
    window.sessionStorage.removeItem(`diggit_federated_${state}`);
    setToken(body.token);
    setMessage(`Signed in as ${body.user.display_name} from ${body.user.home_server ?? pending.homeServer}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      username: String(form.get("username") ?? ""),
      display_name: String(form.get("displayName") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const response = await fetch(`${API_URL}/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? `Request failed with ${response.status}`);
      return;
    }

    const body = (await response.json()) as { token: string; user: { username: string } };
    setAuthSession({ kind: "local", token: body.token });
    setToken(body.token);
    setMessage(`Signed in as ${body.user.username}`);
  }

  function signOut() {
    clearAuthSession();
    setToken(null);
    setMessage("Signed out");
  }

  return (
    <section className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setMode("login")}>
          Login
        </button>
        <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={() => setMode("register")}>
          Register
        </button>
        {token ? (
          <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={signOut}>
            Sign out
          </button>
        ) : null}
      </div>
      {federatedClientId ? (
        <section className="grid gap-2 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-3">
          <h2 className="font-semibold">Continue to another Diggit server</h2>
          <p className="text-sm text-[#59636e]">Authorize {federatedAudience} to use this identity for scoped repo actions.</p>
          <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={authorizeFederatedLogin}>
            Continue
          </button>
        </section>
      ) : null}
      {code && state ? (
        <section className="grid gap-2 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-3">
          <h2 className="font-semibold">Finish federated login</h2>
          <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="button" onClick={finishFederatedLogin}>
            Finish sign in
          </button>
        </section>
      ) : null}
      <form className="grid gap-3.5" onSubmit={submit}>
        <label className="grid gap-1.5">
          Username
          <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="username" required />
        </label>
        {mode === "register" ? (
          <label className="grid gap-1.5">
            Display name
            <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="displayName" />
          </label>
        ) : null}
        <label className="grid gap-1.5">
          Password
          <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="password" required type="password" />
        </label>
        <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
          {mode === "login" ? "Login" : "Create account"}
        </button>
      </form>
      <form className="grid gap-3.5 border-t border-[#d8dee4] pt-3" onSubmit={beginFederatedLogin}>
        <h2 className="font-semibold">Continue with another Diggit server</h2>
        <label className="grid gap-1.5">
          Home server
          <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="homeServer" placeholder="https://git.example.com" required />
        </label>
        <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
          Continue
        </button>
      </form>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
      {token ? <p className="text-[#59636e]">Token stored locally for repo actions.</p> : null}
    </section>
  );
}
