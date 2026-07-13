import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { RunnerPanel } from "~/components/settings/RunnerPanel";

export const useRepositoryRunnersPage = routeLoader$(({ params }) => {
  return {
    encodedName: encodeURIComponent(params.name),
    encodedOwner: encodeURIComponent(params.owner),
    name: params.name,
    owner: params.owner,
  };
});

export default component$(() => {
  const route = useRepositoryRunnersPage();

  return (
    <div class="settings-group-page">
      <section class="settings-group-page__copy">
        <h2 class="settings-group-page__title">Repository runners</h2>
        <p class="settings-group-page__description">
          Manage repository-scope Gitea-compatible runners.
        </p>
      </section>
      <RunnerPanel
        listPath={`/repos/${route.value.encodedOwner}/${route.value.encodedName}/actions/runners`}
        scopeLabel={`${route.value.owner}/${route.value.name}`}
        tokenPath={`/repos/${route.value.encodedOwner}/${route.value.encodedName}/actions/runners/registration-token`}
      />
    </div>
  );
});
