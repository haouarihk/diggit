import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { SecretsVariablesPanel } from "~/components/settings/SecretsVariablesPanel";
import {
  listOrganizationRunnerSecrets,
  listOrganizationRunnerVariables,
} from "~/lib/api";

export const useOrganizationSecretsPage = routeLoader$(async ({ params }) => {
  const [secrets, variables] = await Promise.all([
    listOrganizationRunnerSecrets(params.org).catch(() => ({ data: [] })),
    listOrganizationRunnerVariables(params.org).catch(() => ({ data: [] })),
  ]);

  return {
    encodedOrg: encodeURIComponent(params.org),
    secrets: secrets.data,
    variables: variables.data,
  };
});

export default component$(() => {
  const route = useOrganizationSecretsPage();

  return (
    <SecretsVariablesPanel
      scopeLabel="organization"
      secrets={route.value.secrets}
      secretsPath={`/orgs/${route.value.encodedOrg}/actions/secrets`}
      variables={route.value.variables}
      variablesPath={`/orgs/${route.value.encodedOrg}/actions/variables`}
    />
  );
});
