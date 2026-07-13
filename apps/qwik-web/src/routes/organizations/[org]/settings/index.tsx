import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { OrganizationGeneralSettingsForm } from "~/components/settings/OrganizationGeneralSettingsForm";
import { getOrganization } from "~/lib/api";

export const useOrganizationSettingsPage = routeLoader$(async ({ params }) => {
  return {
    organization: await getOrganization(params.org),
  };
});

export default component$(() => {
  const route = useOrganizationSettingsPage();

  return <OrganizationGeneralSettingsForm organization={route.value.organization} />;
});
