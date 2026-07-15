import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { getAuthToken } from "~/lib/auth-session";

const AUTH_COOKIE_PREFIX = "diggit_token=";

type PrivateRepositoryNotFoundProps = {
  retryAfterSeconds?: number | null;
  variant?: "not-found" | "rate-limited" | "ready" | "unavailable";
};

export const PrivateRepositoryNotFound = component$(
  ({ retryAfterSeconds = null, variant = "not-found" }: PrivateRepositoryNotFoundProps) => {
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

    const message =
      status.value === "retrying"
        ? "Restoring your signed-in session and retrying..."
        : variant === "rate-limited"
          ? retryAfterSeconds && retryAfterSeconds > 0
            ? `The backend is rate limiting repository requests right now. Wait about ${formatRetryAfter(retryAfterSeconds)} and try again.`
            : "The backend is rate limiting repository requests right now. Please wait a moment and try again."
          : variant === "unavailable"
            ? "The backend could not load this repository right now. Please try again in a moment."
            : "The backend did not return a repository for this route.";

    const title =
      variant === "rate-limited"
        ? "Too many requests"
        : variant === "unavailable"
          ? "Repository temporarily unavailable"
          : "Repository not found";

    return (
      <section class="repository-not-found">
        <h1 class="repository-not-found__title">{title}</h1>
        <p class="repository-not-found__text">{message}</p>
        {status.value !== "retrying" && variant !== "not-found" ? (
          <div class="repository-not-found__actions">
            <button class="button button--secondary" onClick$={() => window.location.reload()} type="button">
              Try again
            </button>
          </div>
        ) : null}
      </section>
    );
  },
);

function formatRetryAfter(value: number) {
  if (value < 60) {
    return `${value} second${value === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(value / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
