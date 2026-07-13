import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { OrganizationPanel } from "~/components/organizations/OrganizationPanel";

export default component$(() => {
  return (
    <div class="organizations-page">
      <section class="organizations-page__hero">
        <p class="organizations-page__eyebrow">Organizations</p>
        <h1 class="organizations-page__title">Teams</h1>
        <p class="organizations-page__description">
          Create shared namespaces for repositories, runners, and collaboration.
        </p>
      </section>
      <OrganizationPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Organizations · Diggit",
  meta: [
    {
      name: "description",
      content:
        "Create and manage shared Diggit organizations for repositories and collaboration.",
    },
  ],
};
