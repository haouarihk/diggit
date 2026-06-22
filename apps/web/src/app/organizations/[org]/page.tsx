import { OrganizationFollowButton } from "@/components/OrganizationFollowButton";
import { getOrganization } from "@/lib/api";
import { publicApiBaseUrl } from "@/lib/runtime-config";
import type { Metadata } from "next";

type OrganizationProfilePageProps = {
  params: Promise<{
    org: string;
  }>;
};

export async function generateMetadata({ params }: OrganizationProfilePageProps): Promise<Metadata> {
  const { org } = await params;
  const organization = await getOrganization(org);
  const title = organization.display_name;
  const description = organization.description || `${organization.display_name}'s public repositories on Diggit.`;
  const image = `${publicApiBaseUrl()}/social/organizations/${encodeURIComponent(organization.name)}/preview.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${organization.display_name} social preview` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

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
