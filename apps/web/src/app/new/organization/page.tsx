import { CreateOrganizationForm } from "@/components/OrganizationPanel";

export default function NewOrganizationPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <section>
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          New team namespace
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Create a new organization</h1>
        <p className="text-[#59636e]">
          Reserve a globally unique owner name for team repositories.
        </p>
      </section>

      <CreateOrganizationForm />
    </div>
  );
}
