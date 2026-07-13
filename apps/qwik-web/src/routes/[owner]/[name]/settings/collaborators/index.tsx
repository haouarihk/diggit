import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { CollaboratorsPanel } from "~/components/settings/CollaboratorsPanel";
import { listRepositoryCollaborators } from "~/lib/api";

export const useRepositoryCollaboratorsPage = routeLoader$(async ({ params }) => {
  const collaborators = await listRepositoryCollaborators(
    params.owner,
    params.name,
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
