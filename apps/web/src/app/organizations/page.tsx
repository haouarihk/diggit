import { OrganizationPanel } from "@/components/OrganizationPanel";

export default function OrganizationsPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">Organizations</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Teams</h1>
        <p className="text-[#59636e]">
          Create shared namespaces for repositories, runners, and collaboration.
        </p>
      </section>
      <OrganizationPanel />
    </div>
  );
}
