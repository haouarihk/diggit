import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { OAuthTokensPanel } from "~/components/settings/OAuthTokensPanel";

export default component$(() => {
  return (
    <div class="settings-page">
      <section class="settings-page__hero">
        <p class="settings-page__eyebrow">Account settings</p>
        <h1 class="settings-page__title">OAuth tokens</h1>
        <p class="settings-page__description">
          Review and revoke tokens issued to OAuth applications.
        </p>
      </section>
      <OAuthTokensPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "OAuth Tokens · Diggit",
};
