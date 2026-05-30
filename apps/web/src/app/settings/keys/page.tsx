import { SshKeysPanel } from "@/components/SshKeysPanel";

export default function SshKeysPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          Account settings
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">SSH keys</h1>
        <p className="text-[#59636e]">Add public keys used for Git SSH access and clone workflows.</p>
      </section>
      <SshKeysPanel />
    </div>
  );
}
