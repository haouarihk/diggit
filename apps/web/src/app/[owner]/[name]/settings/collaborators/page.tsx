import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";
import { listRepositoryCollaborators } from "@/lib/api";

type Props = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryCollaboratorsPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const collaborators = await listRepositoryCollaborators(decodedOwner, decodedName).catch(() => ({ data: [] }));

  return (
    <CollaboratorsPanel
      addPath={`/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/collaborators`}
      collaborators={collaborators.data}
      permissionName="permission"
      scopeLabel="repository"
    />
  );
}
