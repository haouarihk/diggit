import { $, component$, useSignal } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";

import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type FileEditorProps = {
  content: string;
  name: string;
  owner: string;
  path: string;
  redirectTo: string;
};

export const FileEditor = component$(
  ({ content, name, owner, path, redirectTo }: FileEditorProps) => {
    const nav = useNavigate();
    const message = useSignal("");
    const isSaving = useSignal(false);
    const commitMessage = useSignal("");
    const fileContent = useSignal(content);

    const submit = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to edit";
        return;
      }

      const params = new URLSearchParams({ path });

      isSaving.value = true;
      message.value = "";

      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents?${params.toString()}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content: fileContent.value,
            message: commitMessage.value.trim() || undefined,
          }),
        },
      );

      isSaving.value = false;

      if (!response.ok) {
        message.value = `Failed: ${response.status}`;
        return;
      }

      await nav(redirectTo);
    });

    return (
      <form class="file-editor" onSubmit$={submit} preventdefault:submit>
        <label class="pull-request-flow__field">
          Commit message
          <input
            class="settings-drawer-form__input"
            placeholder={`Update ${path}`}
            value={commitMessage.value}
            onInput$={(_, currentTarget) => {
              commitMessage.value = currentTarget.value;
            }}
          />
        </label>

        <label class="pull-request-flow__field">
          File content
          <textarea
            class="file-editor__textarea"
            name="content"
            value={fileContent.value}
            onInput$={(_, currentTarget) => {
              fileContent.value = currentTarget.value;
            }}
          />
        </label>

        <div class="file-editor__actions">
          <button
            class="settings-resource-panel__primary-button"
            disabled={isSaving.value}
            type="submit"
          >
            {isSaving.value ? "Saving..." : "Commit changes"}
          </button>
          {message.value ? <span class="issue-detail-page__meta">{message.value}</span> : null}
        </div>
      </form>
    );
  },
);
