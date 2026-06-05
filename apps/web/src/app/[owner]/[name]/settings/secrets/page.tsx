import { SecretsVariablesPanel } from "@/components/SecretsVariablesPanel";
import { listRepositoryRunnerSecrets, listRepositoryRunnerVariables } from "@/lib/api";

type Props = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositorySecretsPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const [secrets, variables] = await Promise.all([
    listRepositoryRunnerSecrets(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listRepositoryRunnerVariables(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);
  const encodedOwner = encodeURIComponent(decodedOwner);
  const encodedName = encodeURIComponent(decodedName);

  return (
    <SecretsVariablesPanel
      scopeLabel="repository"
      secrets={secrets.data}
      secretsPath={`/repos/${encodedOwner}/${encodedName}/actions/secrets`}
      variables={variables.data}
      variablesPath={`/repos/${encodedOwner}/${encodedName}/actions/variables`}
    />
  );
}
