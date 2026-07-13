import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { OAuthApplicationsPanel } from "~/components/settings/OAuthApplicationsPanel";

export default component$(() => {
  return (
    <div class="settings-page">
      <section class="settings-page__hero">
        <p class="settings-page__eyebrow">Account settings</p>
        <h1 class="settings-page__title">OAuth applications</h1>
        <p class="settings-page__description">
          Register Dokploy or other clients that need GitLab-compatible access
          to your Diggit repositories.
        </p>
      </section>
      <OAuthApplicationsPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "OAuth Applications · Diggit",
};
