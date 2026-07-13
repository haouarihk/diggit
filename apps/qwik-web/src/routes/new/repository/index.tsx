import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { routeLoader$ } from "@builder.io/qwik-city";
import { CreateRepoForm } from "~/components/repositories/CreateRepoForm";

export const useCreateRepositoryPage = routeLoader$(({ url }) => {
  return {
    owner: url.searchParams.get("owner") ?? "",
  };
});

export default component$(() => {
  const data = useCreateRepositoryPage();

  return (
    <div class="new-repository-page">
      <section>
        <p class="new-repository-page__eyebrow">New project</p>
        <h1 class="new-repository-page__title">Create a new repository</h1>
        <p class="new-repository-page__description">
          Start a repository under your user namespace or an organization where
          you have access.
        </p>
      </section>

      <CreateRepoForm initialOwner={data.value.owner} />
    </div>
  );
});

export const head: DocumentHead = {
  title: "New Repository · Diggit",
};
