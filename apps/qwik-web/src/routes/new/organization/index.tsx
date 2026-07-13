import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { CreateOrganizationForm } from "~/components/organizations/OrganizationPanel";

export default component$(() => {
  return (
    <div class="new-organization-page">
      <section>
        <p class="new-organization-page__eyebrow">New team namespace</p>
        <h1 class="new-organization-page__title">Create a new organization</h1>
        <p class="new-organization-page__description">
          Reserve a globally unique owner name for team repositories.
        </p>
      </section>

      <CreateOrganizationForm />
    </div>
  );
});

export const head: DocumentHead = {
  title: "New Organization · Diggit",
  meta: [
    {
      name: "description",
      content: "Create a new shared Diggit organization namespace.",
    },
  ],
};
