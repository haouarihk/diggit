import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";
import { listOrganizationMembers } from "@/lib/api";

type Props = {
  params: Promise<{ org: string }>;
};

export default async function OrganizationCollaboratorsPage({ params }: Props) {
  const { org } = await params;
  const decodedOrg = decodeURIComponent(org);
  const collaborators = await listOrganizationMembers(decodedOrg).catch(() => ({ data: [] }));

  return (
    <CollaboratorsPanel
      addPath={`/organizations/${encodeURIComponent(decodedOrg)}/members`}
      collaborators={collaborators.data}
      permissionName="role"
      scopeLabel="organization"
    />
  );
}
