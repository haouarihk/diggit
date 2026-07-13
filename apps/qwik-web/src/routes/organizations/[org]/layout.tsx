import { Slot, component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { OrganizationHeader } from "~/components/organizations/OrganizationHeader";
import { getOrganization } from "~/lib/api";

export const useOrganizationLayout = routeLoader$(async ({ params }) => {
  return getOrganization(params.org).catch(() => null);
});

export default component$(() => {
  const organization = useOrganizationLayout();

  if (!organization.value) {
    return (
      <section class="organization-not-found">
        <h1 class="organization-not-found__title">Organization not found</h1>
        <p class="organization-not-found__text">
          The backend did not return an organization for this route.
        </p>
      </section>
    );
  }

  return (
    <div class="organization-layout">
      <OrganizationHeader organization={organization.value} />
      <Slot />
    </div>
  );
});
