import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { OrganizationFollowButton } from "~/components/organizations/OrganizationFollowButton";
import { useOrganizationLayout } from "./layout";

export default component$(() => {
  const organization = useOrganizationLayout();

  return (
    <section class="organization-overview-card">
      <div class="organization-overview-card__header">
        <div>
          <h2 class="organization-overview-card__title">Overview</h2>
          <p class="organization-overview-card__description">
            {organization.value?.description ||
              "This organization has not added a description yet."}
          </p>
        </div>
        <OrganizationFollowButton />
      </div>
    </section>
  );
});

export const head: DocumentHead = {
  title: "Organization · Diggit",
};
