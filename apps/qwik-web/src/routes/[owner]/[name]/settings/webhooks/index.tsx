import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { RepositoryWebhooksPanel } from "~/components/settings/RepositoryWebhooksPanel";

export const useRepositoryWebhooksPage = routeLoader$(({ params }) => {
  return {
    name: params.name,
    owner: params.owner,
  };
});

export default component$(() => {
  const route = useRepositoryWebhooksPage();

  return (
    <RepositoryWebhooksPanel
      name={route.value.name}
      owner={route.value.owner}
    />
  );
});
