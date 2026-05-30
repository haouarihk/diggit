import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">Server administration</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Admin</h1>
        <p className="text-[#59636e]">
          Manage federation policy and inspect server-to-server activity from one place.
        </p>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <Link className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" href="/admin/servers">
          <strong>Federated servers</strong>
          <span className="text-[#59636e]">Whitelist, blacklist, and review known remote hosts.</span>
        </Link>
        <Link className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" href="/admin/activity">
          <strong>Activity log</strong>
          <span className="text-[#59636e]">Inspect inbound and outbound ActivityPub messages.</span>
        </Link>
        <Link className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4" href="/admin/runners">
          <strong>Server runners</strong>
          <span className="text-[#59636e]">Manage server-scope Gitea-compatible runners.</span>
        </Link>
      </section>
    </div>
  );
}
