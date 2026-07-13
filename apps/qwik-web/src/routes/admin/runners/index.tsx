import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { RunnerPanel } from "~/components/settings/RunnerPanel";

export default component$(() => {
  return (
    <div class="admin-page">
      <section class="admin-page__hero">
        <p class="admin-page__eyebrow">Admin / Runners</p>
        <h1 class="admin-page__title">Server runners</h1>
        <p class="admin-page__description">
          Manage server-scope Gitea-compatible runners.
        </p>
      </section>
      <RunnerPanel
        listPath="/admin/actions/runners"
        scopeLabel="Server"
        tokenPath="/admin/actions/runners/registration-token"
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Server Runners · Diggit",
};
