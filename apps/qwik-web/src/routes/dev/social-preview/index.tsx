import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { SocialPreviewDevClient } from "~/components/dev/SocialPreviewDevClient";

export default component$(() => {
  if (!import.meta.env.DEV) {
    return (
      <section class="repository-not-found">
        <h1 class="repository-not-found__title">Preview not available</h1>
        <p class="repository-not-found__text">
          The social preview tester is only available in development mode.
        </p>
      </section>
    );
  }

  return <SocialPreviewDevClient />;
});

export const head: DocumentHead = {
  title: "Social Preview Tester · Diggit",
};
