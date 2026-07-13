"use client";

import { authHeaders } from "@/lib/auth-session";
import type { Activity } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useEffect, useState } from "react";

const API_URL = apiBaseUrl();

export default function AdminActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [message, setMessage] = useState("");

  async function loadActivities() {
    const response = await fetch(`${API_URL}/activities`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to load activity: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: Activity[] };
    setActivities(body.data);
  }

  useEffect(() => {
    void loadActivities();
  }, []);

  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">Admin / Activity</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Federation activity</h1>
        <p className="text-[#59636e]">
          Outbound and inbound ActivityPub messages are kept here so federation behavior can be
          inspected while the MVP evolves.
        </p>
      </section>

      <section className="rounded-md border border-[#d0d7de] bg-white">
        <div className="flex items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 font-semibold">
          <span>Activity log</span>
          <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold" type="button" onClick={() => void loadActivities()}>
            Refresh
          </button>
        </div>
        {message ? <div className="border-b border-[#d8dee4] px-4 py-2 text-[#59636e]">{message}</div> : null}
        {activities.length === 0 ? (
          <div className="p-4">
            <p className="text-[#59636e]">No federated activities yet.</p>
          </div>
        ) : (
          <div className="grid">
            {activities.map((activity) => (
              <article className="grid gap-2 border-b border-[#d8dee4] p-4 last:border-b-0" key={activity.id}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong>
                    {activity.activity_type} {activity.object_type}
                  </strong>
                  <span className="inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">{activity.direction}</span>
                  <span className="inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">{activity.status}</span>
                </div>
                <p className="text-[#59636e]">{activity.actor}</p>
                {activity.remote_server ? <p>Remote server: {activity.remote_server}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
