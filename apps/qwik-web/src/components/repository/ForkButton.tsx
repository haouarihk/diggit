import { $, component$, useSignal } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { getAuthSession } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type ForkButtonProps = {
  owner: string;
  name: string;
  initialForks: number;
};

export const ForkButton = component$(
  ({ owner, name, initialForks }: ForkButtonProps) => {
    const nav = useNavigate();
    const forks = useSignal(initialForks);
    const isSubmitting = useSignal(false);
    const message = useSignal("");

    const fork = $(async () => {
      const session = getAuthSession();
      if (!session) {
        message.value = "Sign in to fork";
        return;
      }

      isSubmitting.value = true;

      try {
        if (session.kind === "federated") {
          const response = await fetch(`${session.homeServer}/auth/federated/fork`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.homeToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              source_repo_url: `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
            }),
          });

          if (!response.ok) {
            message.value = await responseErrorMessage(response);
            return;
          }

          const forkedRepo = (await response.json()) as {
            http_url: string;
          };
          forks.value += 1;
          message.value = "Fork created on your home server.";
          window.location.href = forkedRepo.http_url.replace(/\.git$/, "");
          return;
        }

        const response = await fetch(
          `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/fork`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({}),
          },
        );

        if (!response.ok) {
          message.value = await responseErrorMessage(response);
          return;
        }

        const forkedRepo = (await response.json()) as {
          owner_handle: string;
          name: string;
        };
        forks.value += 1;
        message.value = "";
        await nav(
          `/${encodeURIComponent(forkedRepo.owner_handle)}/${encodeURIComponent(forkedRepo.name)}`,
        );
      } catch {
        message.value = "Failed to fork repository";
      } finally {
        isSubmitting.value = false;
      }
    });

    return (
      <div class="repo-fork">
        <button
          class="repo-fork__button"
          disabled={isSubmitting.value}
          type="button"
          onClick$={fork}
        >
          Fork
        </button>
        <span class="repo-fork__count">{forks.value}</span>
        {message.value ? <span class="repo-fork__message">{message.value}</span> : null}
      </div>
    );
  },
);

async function responseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Fall through to the status-based message.
  }

  return `Failed: ${response.status}`;
}
