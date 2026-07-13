import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { AuthPanel } from "~/components/auth/AuthPanel";

export default component$(() => {
  return (
    <div class="auth-page">
      <section class="auth-page__hero">
        <p class="auth-page__eyebrow">Account</p>
        <h1 class="auth-page__title">Use a local identity for federated Git.</h1>
        <p class="auth-page__description">
          Accounts become ActivityPub actors such as `alice@your-server`, which
          remote servers can display on forks and pull requests.
        </p>
      </section>
      <AuthPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Auth · Diggit",
  meta: [
    {
      name: "description",
      content: "Use a local or federated Diggit identity to sign in.",
    },
  ],
};
