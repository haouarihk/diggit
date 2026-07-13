import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { SettingsOverviewCard } from "~/components/settings/SettingsOverviewCard";

export default component$(() => {
  return (
    <div class="settings-page">
      <section class="settings-page__hero">
        <p class="settings-page__eyebrow">Account settings</p>
        <h1 class="settings-page__title">General settings</h1>
        <p class="settings-page__description">
          Review your account details and manage personal Git access settings.
        </p>
      </section>

      <SettingsOverviewCard />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Settings · Diggit",
  meta: [
    {
      name: "description",
      content: "Review your Diggit account details and personal settings.",
    },
  ],
};
