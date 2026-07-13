import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { RunnerPanel } from "~/components/settings/RunnerPanel";

export const useOrganizationRunnersPage = routeLoader$(({ params }) => {
  return {
    encodedOrg: encodeURIComponent(params.org),
    org: params.org,
  };
});

export default component$(() => {
  const route = useOrganizationRunnersPage();

  return (
    <div class="settings-group-page">
      <section class="settings-group-page__copy">
        <h2 class="settings-group-page__title">{route.value.org} runners</h2>
        <p class="settings-group-page__description">
          Manage organization-scope Gitea-compatible runners.
        </p>
      </section>
      <RunnerPanel
        listPath={`/orgs/${route.value.encodedOrg}/actions/runners`}
        scopeLabel={`${route.value.org} organization`}
        tokenPath={`/orgs/${route.value.encodedOrg}/actions/runners/registration-token`}
      />
    </div>
  );
});
