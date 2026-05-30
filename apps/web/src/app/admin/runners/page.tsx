import { RunnerPanel } from "@/components/RunnerPanel";

export default function AdminRunnersPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          Admin / Runners
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Server runners</h1>
        <p className="text-[#59636e]">Manage server-scope Gitea-compatible runners.</p>
      </section>
      <RunnerPanel
        listPath="/admin/actions/runners"
        scopeLabel="Server"
        tokenPath="/admin/actions/runners/registration-token"
      />
    </div>
  );
}
