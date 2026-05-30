"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Mode = "login" | "register";

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login");
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("diggit_token"),
  );
  const [message, setMessage] = useState<string>("");

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
      setMessage(`Request failed with ${response.status}`);
      return;
    }

    const body = (await response.json()) as { token: string; user: { username: string } };
    window.localStorage.setItem("diggit_token", body.token);
    window.dispatchEvent(new Event("diggit-auth-changed"));
    setToken(body.token);
    setMessage(`Signed in as ${body.user.username}`);
  }

  function signOut() {
    window.localStorage.removeItem("diggit_token");
    window.dispatchEvent(new Event("diggit-auth-changed"));
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
      {message ? <p className="text-[#59636e]">{message}</p> : null}
      {token ? <p className="text-[#59636e]">Token stored locally for repo actions.</p> : null}
    </section>
  );
}
