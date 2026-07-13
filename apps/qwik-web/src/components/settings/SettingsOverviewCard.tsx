import {
  $,
  component$,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { clearAuthSession, getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type CurrentUser } from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

type CurrentUserStatus = "anonymous" | "authenticated" | "loading";

export const SettingsOverviewCard = component$(() => {
  const user = useSignal<CurrentUser | null>(null);
  const status = useSignal<CurrentUserStatus>("anonymous");

  const loadUser = $(async () => {
    const token = getAuthToken();
    if (!token) {
      user.value = null;
      status.value = "anonymous";
      return;
    }

    status.value = "loading";
    const response = await fetch(`${publicApiBaseUrl()}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      clearAuthSession();
      user.value = null;
      status.value = "anonymous";
      return;
    }

    user.value = (await response.json()) as CurrentUser;
    status.value = "authenticated";
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadUser();
  });

  useOnWindow("diggit-auth-changed", loadUser);

  if (user.value) {
    return (
      <section class="settings-overview-card">
        <div class="settings-overview-card__content">
          <div class="settings-overview-card__identity">
            {user.value.avatar_url ? (
              <img
                alt=""
                class="settings-overview-card__avatar"
                height={64}
                src={user.value.avatar_url}
                width={64}
              />
            ) : (
              <span class="settings-overview-card__avatar settings-overview-card__avatar--fallback">
                {user.value.avatar_fallback}
              </span>
            )}
            <div class="settings-overview-card__text">
              <h2 class="settings-overview-card__name">{user.value.display_name}</h2>
              <p class="settings-overview-card__meta">@{user.value.username}</p>
              {user.value.home_server ? (
                <p class="settings-overview-card__meta settings-overview-card__meta--truncate">
                  {user.value.home_server}
                </p>
              ) : null}
            </div>
          </div>
          <Link
            class="settings-overview-card__action"
            href={userProfileHref(user.value.username)}
          >
            View profile
          </Link>
        </div>
      </section>
    );
  }

  if (status.value === "loading") {
    return (
      <section class="settings-overview-card">
        <div class="settings-overview-card__skeleton-title" />
        <div class="settings-overview-card__skeleton-line" />
      </section>
    );
  }

  return (
    <section class="settings-overview-card">
      <h2 class="settings-overview-card__required-title">Sign in required</h2>
      <p class="settings-overview-card__required-text">
        Sign in to view and manage your account settings.
      </p>
      <Link class="settings-overview-card__signin" href="/auth">
        Sign in
      </Link>
    </section>
  );
});
