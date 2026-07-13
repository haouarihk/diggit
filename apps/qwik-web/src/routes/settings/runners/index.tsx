import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { RunnerPanel } from "~/components/settings/RunnerPanel";

export default component$(() => {
  return (
    <div class="settings-page">
      <section class="settings-page__hero">
        <p class="settings-page__eyebrow">Account settings</p>
        <h1 class="settings-page__title">User runners</h1>
        <p class="settings-page__description">
          Manage Gitea-compatible runners scoped to your user account.
        </p>
      </section>
      <RunnerPanel
        listPath="/user/actions/runners"
        scopeLabel="User"
        tokenPath="/user/actions/runners/registration-token"
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "User Runners · Diggit",
};
