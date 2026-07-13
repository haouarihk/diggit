import { Slot, component$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { NavBar } from "~/components/navigation/NavBar";

export default component$(() => {
  return (
    <main class="app-shell">
      <NavBar />
      <div class="page-shell">
        <Slot />
      </div>
    </main>
  );
});

export const head: DocumentHead = {
  title: "Diggit",
  meta: [
    {
      content: "Federated Git hosting for cross-server forks and pull requests.",
      name: "description",
    },
  ],
};
