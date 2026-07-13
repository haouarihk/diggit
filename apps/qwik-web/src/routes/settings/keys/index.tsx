import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { SshKeysPanel } from "~/components/settings/SshKeysPanel";

export default component$(() => {
  return (
    <div class="settings-page">
      <section class="settings-page__hero">
        <p class="settings-page__eyebrow">Account settings</p>
        <h1 class="settings-page__title">SSH keys</h1>
        <p class="settings-page__description">
          Add public keys used for Git SSH access and clone workflows.
        </p>
      </section>
      <SshKeysPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "SSH Keys · Diggit",
};
