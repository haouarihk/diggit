import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { CollaboratorsPanel } from "~/components/settings/CollaboratorsPanel";
import { listRepositoryCollaborators } from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositoryCollaboratorsPage = routeLoader$(async ({ cookie, params }) => {
  const collaborators = await listRepositoryCollaborators(
    params.owner,
    params.name,
    { authToken: authTokenFromCookie(cookie) },
  ).catch(() => ({ data: [] }));

  return {
    collaborators: collaborators.data,
    encodedName: encodeURIComponent(params.name),
    encodedOwner: encodeURIComponent(params.owner),
  };
});

export default component$(() => {
  const route = useRepositoryCollaboratorsPage();

  return (
    <CollaboratorsPanel
      addPath={`/repos/${route.value.encodedOwner}/${route.value.encodedName}/collaborators`}
      collaborators={route.value.collaborators}
      permissionName="permission"
      scopeLabel="repository"
    />
  );
});
