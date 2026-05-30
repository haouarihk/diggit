"use client";

import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ServerPolicyForm() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = window.localStorage.getItem("diggit_token");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/servers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        host: form.get("host"),
        status: form.get("status"),
        reason: form.get("reason"),
      }),
    });
    setMessage(response.ok ? "Server policy saved. Refresh to view it." : `Failed: ${response.status}`);
  }

  return (
    <form className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" onSubmit={submit}>
      <h2>Whitelist or blacklist server</h2>
      <label className="grid gap-1.5">
        Host
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="host" placeholder="git.example.com" required />
      </label>
      <label className="grid gap-1.5">
        Status
        <select className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="status" defaultValue="allowed">
          <option value="allowed">Allowed</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>
      <label className="grid gap-1.5">
        Reason
        <input className="w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]" name="reason" />
      </label>
      <button className="cursor-pointer rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
        Save policy
      </button>
      {message ? <p className="text-[#59636e]">{message}</p> : null}
    </form>
  );
}
