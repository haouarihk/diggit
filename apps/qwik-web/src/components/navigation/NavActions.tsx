import {
  $,
  type PropFunction,
  component$,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { ThemeToggle } from "~/components/navigation/ThemeToggle";
import { clearAuthSession, getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type CurrentUser } from "~/lib/api";
import { userProfileHref } from "~/lib/user-profile";

type CurrentUserStatus = "anonymous" | "authenticated" | "loading";

type NavActionsProps = {
  class?: string;
  onSignOut$: PropFunction<() => void>;
  status: CurrentUserStatus;
  user: CurrentUser | null;
};

export const CurrentUserNavActions = component$(
  ({ class: className }: { class?: string }) => {
    const user = useSignal<CurrentUser | null>(null);
    const status = useSignal<CurrentUserStatus>("loading");

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

    const signOut = $(() => {
      clearAuthSession();
      user.value = null;
      status.value = "anonymous";
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async () => {
      await loadUser();
    });

    useOnWindow("diggit-auth-changed", loadUser);

    return (
      <NavActions
        class={className}
        onSignOut$={signOut}
        status={status.value}
        user={user.value}
      />
    );
  },
);

export const NavActions = component$(
  ({ class: className, onSignOut$, status, user }: NavActionsProps) => {
    const location = useLocation();
    const pathname = location.url.pathname;
    const isFederated = user?.kind === "federated";
    const homeServer = user?.home_server?.replace(/\/+$/, "");
    const profileHref =
      isFederated && homeServer
        ? `${homeServer}/users/${encodeURIComponent(user.username)}`
        : user
          ? userProfileHref(user.username)
          : "#";
    const repositoriesHref =
      isFederated && homeServer
        ? `${homeServer}/users/${encodeURIComponent(user.username)}?tab=repositories`
        : user
          ? `${userProfileHref(user.username)}?tab=repositories`
          : "#";
    const settingsHref = isFederated && homeServer ? `${homeServer}/settings` : "/settings";
    const newRepositoryHref =
      isFederated && homeServer ? `${homeServer}/new/repository` : "/new/repository";
    const newOrganizationHref =
      isFederated && homeServer
        ? `${homeServer}/new/organization`
        : "/new/organization";

    return (
      <div class={["nav-actions", className ?? ""]}>
        <ThemeToggle />
        {user ? (
          <details class="nav-actions__menu" data-ui-dropdown="true">
            <summary class="nav-actions__menu-trigger">+</summary>
            <div class="nav-actions__menu-panel">
              <Link class="nav-actions__menu-link" href={newRepositoryHref}>
                New repository
              </Link>
              <Link class="nav-actions__menu-link" href={newOrganizationHref}>
                New organization
              </Link>
            </div>
          </details>
        ) : null}
        {user?.is_admin ? (
          <Link
            class={[
              "nav-actions__admin",
              pathname.startsWith("/admin") ? "nav-actions__admin--active" : "",
            ]}
            href="/admin"
          >
            Admin
          </Link>
        ) : null}
        {user ? (
          <details class="nav-actions__account" data-ui-dropdown="true">
            <summary class="nav-actions__account-trigger">
              {user.avatar_url ? (
                <img
                  alt=""
                  class="nav-actions__account-avatar"
                  height={32}
                  src={user.avatar_url}
                  width={32}
                />
              ) : (
                <span class="nav-actions__account-avatar nav-actions__account-avatar--fallback">
                  {user.avatar_fallback}
                </span>
              )}
              <span class="nav-actions__account-name">{user.username}</span>
              <span class="nav-actions__account-caret">▾</span>
            </summary>
            <div class="nav-actions__account-menu">
              <div class="nav-actions__account-header">
                <div class="nav-actions__account-label">Signed in as</div>
                <div class="nav-actions__account-username">{user.username}</div>
                {isFederated && homeServer ? (
                  <div class="nav-actions__account-meta">{homeServer}</div>
                ) : null}
              </div>
              <Link class="nav-actions__account-link" href={profileHref}>
                Profile
              </Link>
              <Link class="nav-actions__account-link" href={repositoriesHref}>
                Repositories
              </Link>
              <Link class="nav-actions__account-link" href="/organizations">
                Organizations
              </Link>
              <div class="nav-actions__account-divider">
                <Link class="nav-actions__account-link" href={settingsHref}>
                  Settings
                </Link>
              </div>
              {user.is_admin ? (
                <Link class="nav-actions__account-link" href="/admin">
                  Server admin
                </Link>
              ) : null}
              <button
                class="nav-actions__account-link nav-actions__account-link--danger"
                type="button"
                onClick$={onSignOut$}
              >
                Sign out
              </button>
            </div>
          </details>
        ) : status === "loading" ? (
          <div class="nav-actions__loading">
            <div class="nav-actions__loading-signin" />
            <div class="nav-actions__loading-signup" />
          </div>
        ) : (
          <>
            <Link class="nav-actions__signin" href="/auth">
              Sign in
            </Link>
            <Link class="nav-actions__signup" href="/auth">
              Sign up
            </Link>
          </>
        )}
      </div>
    );
  },
);
