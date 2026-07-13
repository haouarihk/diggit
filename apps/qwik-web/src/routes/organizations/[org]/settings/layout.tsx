import { Slot, component$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";

export default component$(() => {
  const location = useLocation();
  const settingsHref = `/organizations/${encodeURIComponent(location.params.org)}/settings`;

  return (
    <div class="settings-layout">
      <aside class="settings-layout__sidebar">
        <nav aria-label="Organization settings" class="settings-layout__nav">
          <SettingsLink href={settingsHref} label="General" />
          <SettingsLink
            href={`${settingsHref}/collaborators`}
            label="Collaborators"
          />
          <SettingsLink
            href={`${settingsHref}/secrets`}
            label="Secrets and variables"
          />
          <SettingsLink href={`${settingsHref}/runners`} label="Runners" />
        </nav>
      </aside>
      <section class="settings-layout__content">
        <Slot />
      </section>
    </div>
  );
});

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
