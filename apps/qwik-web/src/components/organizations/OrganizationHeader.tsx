import { component$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { type Organization } from "~/lib/api";

type OrganizationHeaderProps = {
  organization: Organization;
};

export const OrganizationHeader = component$(
  ({ organization }: OrganizationHeaderProps) => {
    const location = useLocation();
    const baseHref = `/organizations/${encodeURIComponent(organization.name)}`;
    const tabs = [
      { href: baseHref, label: "Overview", value: "overview" },
      {
        href: `${baseHref}/repositories`,
        label: "Repositories",
        value: "repositories",
      },
      { href: `${baseHref}/settings`, label: "Settings", value: "settings" },
    ] as const;
    const active = activeTab(location.url.pathname, baseHref);

    return (
      <section class="organization-header">
        <div class="organization-header__top">
          <div class="organization-header__identity">
            <span class="organization-header__badge">
              {organizationInitials(organization)}
            </span>
            <div class="organization-header__text">
              <h1 class="organization-header__name">{organization.display_name}</h1>
              <p class="organization-header__handle">@{organization.name}</p>
            </div>
          </div>
        </div>

        <nav aria-label="Organization" class="organization-header__tabs">
          {tabs.map((tab) => (
            <Link
              class={[
                "organization-header__tab",
                active === tab.value ? "organization-header__tab--active" : "",
              ]}
              href={tab.href}
              key={tab.value}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </section>
    );
  },
);

function organizationInitials(organization: Organization) {
  const label = organization.display_name || organization.name;
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || organization.name.slice(0, 2).toUpperCase()
  );
}

function activeTab(pathname: string, baseHref: string) {
  if (pathname.startsWith(`${baseHref}/repositories`)) {
    return "repositories";
  }
  if (pathname.startsWith(`${baseHref}/settings`)) {
    return "settings";
  }
  return "overview";
}
