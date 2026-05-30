import { AuthPanel } from "@/components/AuthPanel";

export default function AuthPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">Account</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Use a local identity for federated Git.</h1>
        <p className="text-[#59636e]">
          Accounts become ActivityPub actors such as `alice@your-server`, which remote servers can
          display on forks and pull requests.
        </p>
      </section>
      <AuthPanel />
    </div>
  );
}
