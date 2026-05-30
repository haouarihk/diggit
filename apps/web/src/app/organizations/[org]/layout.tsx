import { OrganizationHeader } from "@/components/OrganizationHeader";
import { getOrganization } from "@/lib/api";

type OrganizationLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    org: string;
  }>;
};

export default async function OrganizationLayout({ children, params }: OrganizationLayoutProps) {
  const { org } = await params;
  const organization = await getOrganization(org);

  return (
    <div className="grid gap-6">
      <OrganizationHeader organization={organization} />
      {children}
    </div>
  );
}
