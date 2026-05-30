import { RunnerPanel } from "@/components/RunnerPanel";

export default function UserRunnersPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          Account settings
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">User runners</h1>
        <p className="text-[#59636e]">Manage Gitea-compatible runners scoped to your user account.</p>
      </section>
      <RunnerPanel listPath="/user/actions/runners" scopeLabel="User" tokenPath="/user/actions/runners/registration-token" />
    </div>
  );
}
