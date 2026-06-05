import { OrganizationGeneralSettingsForm } from "@/components/OrganizationGeneralSettingsForm";
import { getOrganization } from "@/lib/api";

type OrganizationSettingsPageProps = {
  params: Promise<{
    org: string;
  }>;
};

export default async function OrganizationSettingsPage({ params }: OrganizationSettingsPageProps) {
  const { org } = await params;
  const organization = await getOrganization(org);

  return <OrganizationGeneralSettingsForm organization={organization} />;
}
