import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { RepositoryGeneralSettingsForm } from "~/components/settings/RepositoryGeneralSettingsForm";
import { getRepository, listRepositoryBranches } from "~/lib/api";
import { authTokenFromCookie } from "~/lib/server-auth";

export const useRepositorySettingsPage = routeLoader$(async ({ cookie, params }) => {
  const authToken = authTokenFromCookie(cookie);
  const [repo, branches] = await Promise.all([
    getRepository(params.owner, params.name, { authToken }),
    listRepositoryBranches(params.owner, params.name, { authToken }).catch(() => ({
      data: [],
    })),
  ]);
  const redirectTo =
    repo.owner?.kind === "organization"
      ? `/organizations/${encodeURIComponent(repo.owner_handle)}/repositories`
      : `/${encodeURIComponent(repo.owner_handle)}`;

  return {
    branches: branches.data,
    redirectTo,
    repository: repo,
  };
});

export default component$(() => {
  const route = useRepositorySettingsPage();

  return (
    <RepositoryGeneralSettingsForm
      branches={route.value.branches}
      redirectTo={route.value.redirectTo}
      repository={route.value.repository}
    />
  );
});
