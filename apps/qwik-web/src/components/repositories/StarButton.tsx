import { $, component$, useSignal } from "@builder.io/qwik";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type StarButtonProps = {
  owner: string;
  name: string;
  initialStars: number;
  initialStarred?: boolean;
};

export const StarButton = component$(
  ({ owner, name, initialStars, initialStarred = false }: StarButtonProps) => {
    const stars = useSignal(initialStars);
    const starred = useSignal(initialStarred);
    const isSubmitting = useSignal(false);
    const message = useSignal("");

    const toggleStar = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to star";
        return;
      }

      isSubmitting.value = true;
      const nextStarred = !starred.value;

      try {
        const response = await fetch(
          `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/star`,
          {
            method: nextStarred ? "POST" : "DELETE",
            headers: { authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) {
          message.value = `Failed: ${response.status}`;
          return;
        }

        const repo = (await response.json()) as {
          stars_count: number;
          viewer_has_starred?: boolean;
        };
        stars.value = repo.stars_count;
        starred.value = repo.viewer_has_starred ?? nextStarred;
        message.value = "";
      } catch {
        message.value = "Failed to update star";
      } finally {
        isSubmitting.value = false;
      }
    });

    return (
      <div class="repo-star">
        <div
          class={[
            "repo-star__control",
            starred.value ? "repo-star__control--active" : "",
          ]}
        >
          <button
            class={[
              "repo-star__button",
              starred.value ? "repo-star__button--active" : "",
            ]}
            disabled={isSubmitting.value}
            type="button"
            onClick$={toggleStar}
          >
            <span
              aria-hidden="true"
              class={[
                "repo-star__icon",
                starred.value ? "repo-star__icon--active" : "",
              ]}
            >
              ★
            </span>
            <span>{starred.value ? "Starred" : "Star"}</span>
          </button>
          <span class="repo-star__count">{stars.value}</span>
        </div>
        {message.value ? (
          <span class="repo-star__message">{message.value}</span>
        ) : null}
      </div>
    );
  },
);
