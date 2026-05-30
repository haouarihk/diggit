import { DeleteOrganizationButton } from "@/components/DeleteOrganizationButton";
import { getOrganization } from "@/lib/api";

type OrganizationSettingsPageProps = {
  params: Promise<{
    org: string;
  }>;
};

export default async function OrganizationSettingsPage({ params }: OrganizationSettingsPageProps) {
  const { org } = await params;
  const organization = await getOrganization(org);

  return (
    <main className="grid gap-6">
      <section className="rounded-md border border-[#d0d7de] bg-white p-5">
        <h2 className="text-xl font-semibold">General settings</h2>
        <dl className="mt-4 grid gap-4">
          <div>
            <dt className="font-semibold">Display name</dt>
            <dd className="text-[#59636e]">{organization.display_name}</dd>
          </div>
          <div>
            <dt className="font-semibold">Handle</dt>
            <dd className="text-[#59636e]">@{organization.name}</dd>
          </div>
          <div>
            <dt className="font-semibold">Description</dt>
            <dd className="text-[#59636e]">{organization.description || "No description provided."}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-[#cf222e] bg-white p-5">
        <h2 className="text-xl font-semibold text-[#cf222e]">Delete organization</h2>
        <p className="mt-2 max-w-2xl text-[#59636e]">
          This permanently deletes the organization. The backend will reject deletion while the organization owns repositories.
        </p>
        <div className="mt-4">
          <DeleteOrganizationButton name={organization.name} />
        </div>
      </section>
    </main>
  );
}
