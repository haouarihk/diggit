import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import { Link, useNavigate } from "@builder.io/qwik-city";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type Organization } from "~/lib/api";

export const OrganizationPanel = component$(() => {
  const organizations = useSignal<Organization[]>([]);
  const isLoading = useSignal(true);
  const message = useSignal("");

  const loadOrganizations = $(async () => {
    isLoading.value = true;
    message.value = "";

    const token = getAuthToken();
    const response = await fetch(`${publicApiBaseUrl()}/organizations`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      organizations.value = [];
      message.value = "Sign in to view your organizations.";
      isLoading.value = false;
      return;
    }

    const body = (await response.json()) as { data: Organization[] };
    organizations.value = body.data;
    isLoading.value = false;
  });

  useTask$(async () => {
    if (!isBrowser) {
      return;
    }

    await loadOrganizations();
  });

  return (
    <section class="organization-panel">
      <div class="organization-panel__header">
        <div>
          <h2 class="organization-panel__title">Your organizations</h2>
          <p class="organization-panel__subtitle">
            Shared owner namespaces you can work with.
          </p>
        </div>
        <div class="organization-panel__actions">
          <button
            class="organization-panel__secondary-button"
            disabled={isLoading.value}
            type="button"
            onClick$={loadOrganizations}
          >
            {isLoading.value ? "Loading..." : "Refresh"}
          </button>
          <Link class="organization-panel__primary-button" href="/new/organization">
            New organization
          </Link>
        </div>
      </div>

      {isLoading.value ? (
        <div class="organization-panel__loading">Loading organizations...</div>
      ) : organizations.value.length === 0 ? (
        <div class="organization-panel__empty">
          <h3 class="organization-panel__empty-title">No organizations yet</h3>
          <p class="organization-panel__empty-text">
            {message.value ||
              "Create an organization to share repositories under a team name."}
          </p>
          <Link class="organization-panel__primary-button" href="/new/organization">
            Create organization
          </Link>
        </div>
      ) : (
        <div class="organization-panel__list">
          {organizations.value.map((organization) => (
            <article class="organization-card" key={organization.id}>
              <div class="organization-card__main">
                <span class="organization-card__badge">
                  {organizationInitials(organization)}
                </span>
                <div class="organization-card__body">
                  <div class="organization-card__heading">
                    <Link
                      class="organization-card__link"
                      href={`/organizations/${encodeURIComponent(organization.name)}`}
                    >
                      {organization.display_name || organization.name}
                    </Link>
                    <span class="organization-card__handle">
                      @{organization.name}
                    </span>
                  </div>
                  <p class="organization-card__description">
                    {organization.description || "No description provided."}
                  </p>
                </div>
              </div>

              <div class="organization-card__meta">
                <span class="organization-card__created">
                  Created {formatDate(organization.created_at)}
                </span>
                <Link
                  class="organization-card__open"
                  href={`/organizations/${encodeURIComponent(organization.name)}`}
                >
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

export const CreateOrganizationForm = component$(() => {
  const nav = useNavigate();
  const message = useSignal("");
  const isSubmitting = useSignal(false);

  const submit = $(async (_event: SubmitEvent, form: HTMLFormElement) => {
    const token = getAuthToken();
    const data = new FormData(form);
    isSubmitting.value = true;
    message.value = "";

    try {
      const response = await fetch(`${publicApiBaseUrl()}/organizations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: data.get("name"),
          display_name: data.get("displayName"),
          description: data.get("description"),
        }),
      });

      if (!response.ok) {
        message.value = `Failed: ${response.status}`;
        return;
      }

      const organization = (await response.json()) as Organization;
      await nav(`/organizations/${encodeURIComponent(organization.name)}`);
    } finally {
      isSubmitting.value = false;
    }
  });

  return (
    <form class="create-organization-form" onSubmit$={submit} preventdefault:submit>
      <h2 class="create-organization-form__title">Create organization</h2>
      <label class="create-organization-form__label">
        Name
        <input class="create-organization-form__input" name="name" required />
      </label>
      <label class="create-organization-form__label">
        Display name
        <input class="create-organization-form__input" name="displayName" />
      </label>
      <label class="create-organization-form__label">
        Description
        <textarea
          class="create-organization-form__textarea"
          name="description"
          rows={3}
        />
      </label>
      <button
        class="organization-panel__primary-button"
        disabled={isSubmitting.value}
        type="submit"
      >
        {isSubmitting.value ? "Creating..." : "Create organization"}
      </button>
      {message.value ? (
        <p class="create-organization-form__message">{message.value}</p>
      ) : null}
      <p class="create-organization-form__help">
        Reserved names like auth, activity, servers, admin, repos, and
        organizations cannot be claimed.
      </p>
    </form>
  );
});

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
