import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { CollaboratorsPanel } from "~/components/settings/CollaboratorsPanel";
import { listOrganizationMembers } from "~/lib/api";

export const useOrganizationCollaboratorsPage = routeLoader$(async ({ params }) => {
  const collaborators = await listOrganizationMembers(params.org).catch(() => ({
    data: [],
  }));

  return {
    collaborators: collaborators.data,
    encodedOrg: encodeURIComponent(params.org),
  };
});

export default component$(() => {
  const route = useOrganizationCollaboratorsPage();

  return (
    <CollaboratorsPanel
      addPath={`/organizations/${route.value.encodedOrg}/members`}
      collaborators={route.value.collaborators}
      permissionName="role"
      scopeLabel="organization"
    />
  );
});
