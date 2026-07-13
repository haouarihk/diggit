import { $, component$, useSignal } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type CreateRepoFormProps = {
  initialOwner?: string;
};

export const CreateRepoForm = component$(
  ({ initialOwner = "" }: CreateRepoFormProps) => {
    const nav = useNavigate();
    const message = useSignal("");

    const submit = $(async (_event: SubmitEvent, formElement: HTMLFormElement) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to create repositories.";
        return;
      }

      const form = new FormData(formElement);
      const response = await fetch(`${publicApiBaseUrl()}/repos`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.get("name"),
          owner: form.get("owner") || undefined,
          description: form.get("description"),
          visibility: form.get("visibility"),
        }),
      });

      if (response.ok) {
        const repo = (await response.json()) as {
          owner_handle: string;
          name: string;
        };
        await nav(
          `/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`,
        );
        return;
      }

      message.value = await responseErrorMessage(response);
    });

    return (
      <form
        class="create-repo-form"
        onSubmit$={submit}
        preventdefault:submit
      >
        <h2 class="create-repo-form__title">Create repository</h2>
        <label class="settings-drawer-form__label">
          Name
          <input class="settings-drawer-form__input" name="name" required />
        </label>
        <label class="settings-drawer-form__label">
          Owner
          <input
            class="settings-drawer-form__input"
            name="owner"
            placeholder="Leave blank for your user, or enter an organization"
            value={initialOwner}
          />
        </label>
        <label class="settings-drawer-form__label">
          Description
          <textarea
            class="settings-drawer-form__textarea create-repo-form__textarea"
            name="description"
          />
        </label>
        <label class="settings-drawer-form__label">
          Visibility
          <select class="settings-drawer-form__input" name="visibility">
            <option value="public" selected>
              Public
            </option>
            <option value="private">Private</option>
          </select>
        </label>
        <button class="settings-resource-panel__primary-button" type="submit">
          Create
        </button>
        {message.value ? (
          <p class="create-repo-form__message">{message.value}</p>
        ) : null}
      </form>
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
    // Fall back to the status code when the API response is not JSON.
  }

  return `Failed: ${response.status}`;
}
