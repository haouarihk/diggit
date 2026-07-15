import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { getAuthToken } from "~/lib/auth-session";

const AUTH_COOKIE_PREFIX = "diggit_token=";

export const PrivateRepositoryNotFound = component$(() => {
  const status = useSignal<"idle" | "retrying">("idle");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const hadAuthCookie = document.cookie
      .split("; ")
      .some((entry) => entry.startsWith(AUTH_COOKIE_PREFIX));
    const token = getAuthToken();
    const hasAuthCookie = document.cookie
      .split("; ")
      .some((entry) => entry.startsWith(AUTH_COOKIE_PREFIX));

    if (token && !hadAuthCookie && hasAuthCookie) {
      status.value = "retrying";
      window.location.reload();
    }
  });

  return (
    <section class="repository-not-found">
      <h1 class="repository-not-found__title">Repository not found</h1>
      <p class="repository-not-found__text">
        {status.value === "retrying"
          ? "Restoring your signed-in session and retrying..."
          : "The backend did not return a repository for this route."}
      </p>
    </section>
  );
});
