import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { AdminServersPanel } from "~/components/admin/AdminServersPanel";

export default component$(() => {
  return (
    <div class="admin-page">
      <section class="admin-page__hero">
        <p class="admin-page__eyebrow">Admin / Servers</p>
        <h1 class="admin-page__title">Federated servers</h1>
        <p class="admin-page__description">
          Unknown servers are recorded as pending on first inbound activity.
          Blocked servers cannot create forks, pull requests, or comments.
        </p>
      </section>
      <AdminServersPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Federated Servers · Diggit",
};
