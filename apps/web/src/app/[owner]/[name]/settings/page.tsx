import { RepositoryGeneralSettingsForm } from "@/components/RepositoryGeneralSettingsForm";
import { getRepository, listRepositoryBranches } from "@/lib/api";

type Props = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositorySettingsPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const [repo, branches] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listRepositoryBranches(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);
  const redirectTo =
    repo.owner?.kind === "organization"
      ? `/organizations/${encodeURIComponent(repo.owner_handle)}/repositories`
      : `/${encodeURIComponent(repo.owner_handle)}`;

  return <RepositoryGeneralSettingsForm branches={branches.data} redirectTo={redirectTo} repository={repo} />;
}
