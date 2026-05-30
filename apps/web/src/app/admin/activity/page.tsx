import { listActivities } from "@/lib/api";

export default async function AdminActivityPage() {
  const activities = await listActivities().catch(() => ({ data: [] }));

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
        <div className="rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 font-semibold">Activity log</div>
        {activities.data.length === 0 ? (
          <div className="p-4">
            <p className="text-[#59636e]">No federated activities yet.</p>
          </div>
        ) : (
          <div className="grid">
            {activities.data.map((activity) => (
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
