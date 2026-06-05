import { SecretsVariablesPanel } from "@/components/SecretsVariablesPanel";
import { listOrganizationRunnerSecrets, listOrganizationRunnerVariables } from "@/lib/api";

type Props = {
  params: Promise<{ org: string }>;
};

export default async function OrganizationSecretsPage({ params }: Props) {
  const { org } = await params;
  const decodedOrg = decodeURIComponent(org);
  const [secrets, variables] = await Promise.all([
    listOrganizationRunnerSecrets(decodedOrg).catch(() => ({ data: [] })),
    listOrganizationRunnerVariables(decodedOrg).catch(() => ({ data: [] })),
  ]);
  const encodedOrg = encodeURIComponent(decodedOrg);

  return (
    <SecretsVariablesPanel
      scopeLabel="organization"
      secrets={secrets.data}
      secretsPath={`/orgs/${encodedOrg}/actions/secrets`}
      variables={variables.data}
      variablesPath={`/orgs/${encodedOrg}/actions/variables`}
    />
  );
}
