import { Slot, component$ } from "@builder.io/qwik";
import {
  Link,
  type DocumentHead,
  routeLoader$,
  useLocation,
} from "@builder.io/qwik-city";
import {
  RepoHeader,
  RepoPageContent,
} from "~/components/repository/RepoHeader";
import { getRepository, listPullRequests } from "~/lib/api";

export const useRepositorySettingsLayout = routeLoader$(async ({ params }) => {
  const [repo, pullRequests] = await Promise.all([
    getRepository(params.owner, params.name),
    listPullRequests(params.owner, params.name, { limit: 1 }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    })),
  ]);

  return {
    pullRequestsCount: pullRequests.pagination?.total ?? pullRequests.data.length,
    repo,
    settingsHref: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}/settings`,
  };
});

export default component$(() => {
  const layout = useRepositorySettingsLayout();

  return (
    <div class="repository-route">
      <RepoHeader
        activeTab="settings"
        pullRequestsCount={layout.value.pullRequestsCount}
        repo={layout.value.repo}
      />
      <RepoPageContent>
        <div class="settings-layout">
          <aside class="settings-layout__sidebar">
            <nav aria-label="Repository settings" class="settings-layout__nav">
              <SettingsLink href={layout.value.settingsHref} label="General" />
              <SettingsLink
                href={`${layout.value.settingsHref}/collaborators`}
                label="Collaborators"
              />
              <SettingsLink
                href={`${layout.value.settingsHref}/secrets`}
                label="Secrets and variables"
              />
              <SettingsLink
                href={`${layout.value.settingsHref}/webhooks`}
                label="Webhooks"
              />
              <SettingsLink
                href={`${layout.value.settingsHref}/runners`}
                label="Runners"
              />
            </nav>
          </aside>
          <section class="settings-layout__content">
            <Slot />
          </section>
        </div>
      </RepoPageContent>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Repository Settings · Diggit",
};

const SettingsLink = component$(({ href, label }: { href: string; label: string }) => {
  const location = useLocation();

  return (
    <Link
      class={[
        "settings-layout__link",
        location.url.pathname === href ? "settings-layout__link--active" : "",
      ]}
      href={href}
    >
      {label}
    </Link>
  );
});
