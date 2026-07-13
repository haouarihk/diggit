import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { AdminActivityPanel } from "~/components/admin/AdminActivityPanel";

export default component$(() => {
  return (
    <div class="admin-page">
      <section class="admin-page__hero">
        <p class="admin-page__eyebrow">Admin / Activity</p>
        <h1 class="admin-page__title">Federation activity</h1>
        <p class="admin-page__description">
          Outbound and inbound ActivityPub messages are kept here so federation
          behavior can be inspected while the MVP evolves.
        </p>
      </section>
      <AdminActivityPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Federation Activity · Diggit",
};
