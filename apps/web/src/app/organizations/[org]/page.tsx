import { OrganizationFollowButton } from "@/components/OrganizationFollowButton";
import { getOrganization } from "@/lib/api";

type OrganizationProfilePageProps = {
  params: Promise<{
    org: string;
  }>;
};

export default async function OrganizationProfilePage({ params }: OrganizationProfilePageProps) {
  const { org } = await params;
  const organization = await getOrganization(org);

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="mt-2 max-w-2xl text-[#59636e]">
            {organization.description || "This organization has not added a description yet."}
          </p>
        </div>
        <OrganizationFollowButton />
      </div>
    </section>
  );
}
