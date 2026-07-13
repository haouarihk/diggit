import { Slot, component$ } from "@builder.io/qwik";
import { Link, type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { publicApiBaseUrl } from "~/lib/api";

export const usePrototypeConfig = routeLoader$(() => {
  return {
    publicApiBaseUrl: publicApiBaseUrl(),
  };
});

export default component$(() => {
  const config = usePrototypeConfig();

  return (
    <div class="app-shell">
      <header class="app-header">
        <div class="app-header__inner">
          <Link class="app-brand" href="/">
            Diggit Qwik Prototype
          </Link>
          <nav class="app-nav">
            <Link class="app-nav__link" href="/">
              Repositories
            </Link>
            <Link class="app-nav__link" href="/search">
              Search
            </Link>
            <Link class="app-nav__link" href="/auth">
              Auth
            </Link>
          </nav>
        </div>
      </header>
      <main class="app-main">
        <section class="panel stack">
          <span class="eyebrow">Backend-owned endpoints</span>
          <p class="muted">
            This prototype talks directly to the Rust backend contract at{" "}
            <strong>{config.value.publicApiBaseUrl}</strong>.
          </p>
        </section>
        <Slot />
      </main>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Diggit Qwik Prototype",
  meta: [
    {
      content: "Prototype Qwik shell backed directly by the Rust API contract.",
      name: "description",
    },
  ],
};
