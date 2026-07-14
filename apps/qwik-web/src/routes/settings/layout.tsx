import { Slot, component$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div class="settings-layout">
      <aside class="settings-layout__sidebar">
        <nav aria-label="User settings" class="settings-layout__nav">
          <SettingsLink href="/settings" label="General" />
          <SettingsLink href="/settings/keys" label="SSH keys" />
          <SettingsLink href="/settings/runners" label="Runners" />
          <SettingsLink
            href="/settings/oauth/applications"
            label="OAuth applications"
          />
          <SettingsLink href="/settings/oauth/tokens" label="OAuth tokens" />
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
