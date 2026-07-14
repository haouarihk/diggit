import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { SecretsVariablesPanel } from "~/components/settings/SecretsVariablesPanel";
import {
  listRepositoryRunnerSecrets,
  listRepositoryRunnerVariables,
} from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositorySecretsPage = routeLoader$(async ({ cookie, params }) => {
  const authToken = authTokenFromCookie(cookie);
  const [secrets, variables] = await Promise.all([
    listRepositoryRunnerSecrets(params.owner, params.name, { authToken }).catch(() => ({
      data: [],
    })),
    listRepositoryRunnerVariables(params.owner, params.name, { authToken }).catch(() => ({
      data: [],
    })),
  ]);

  return {
    encodedName: encodeURIComponent(params.name),
    encodedOwner: encodeURIComponent(params.owner),
    secrets: secrets.data,
    variables: variables.data,
  };
});

export default component$(() => {
  const route = useRepositorySecretsPage();

  return (
    <SecretsVariablesPanel
      scopeLabel="repository"
      secrets={route.value.secrets}
      secretsPath={`/repos/${route.value.encodedOwner}/${route.value.encodedName}/actions/secrets`}
      variables={route.value.variables}
      variablesPath={`/repos/${route.value.encodedOwner}/${route.value.encodedName}/actions/variables`}
    />
  );
});
