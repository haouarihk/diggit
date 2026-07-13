import { $, type PropFunction, component$, useSignal } from "@builder.io/qwik";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type ServerPolicyFormProps = {
  onSaved$?: PropFunction<() => void>;
};

export const ServerPolicyForm = component$(({ onSaved$ }: ServerPolicyFormProps) => {
  const message = useSignal("");

  const submit = $(async (_event: SubmitEvent, formElement: HTMLFormElement) => {
    const token = getAuthToken();
    const form = new FormData(formElement);
    const response = await fetch(`${publicApiBaseUrl()}/servers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        host: form.get("host"),
        status: form.get("status"),
        reason: form.get("reason"),
      }),
    });
    if (!response.ok) {
      message.value = `Failed: ${response.status}`;
      return;
    }

    message.value = "Server policy saved.";
    formElement.reset();
    if (onSaved$) {
      await onSaved$();
    }
  });

  return (
    <form class="admin-policy-form" onSubmit$={submit} preventdefault:submit>
      <h2 class="admin-policy-form__title">Whitelist or blacklist server</h2>
      <label class="settings-drawer-form__label">
        Host
        <input
          class="settings-drawer-form__input"
          name="host"
          placeholder="git.example.com"
          required
        />
      </label>
      <label class="settings-drawer-form__label">
        Status
        <select class="settings-drawer-form__input" name="status">
          <option value="allowed" selected>
            Allowed
          </option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>
      <label class="settings-drawer-form__label">
        Reason
        <input class="settings-drawer-form__input" name="reason" />
      </label>
      <button class="settings-resource-panel__primary-button" type="submit">
        Save policy
      </button>
      {message.value ? (
        <p class="admin-policy-form__message">{message.value}</p>
      ) : null}
    </form>
  );
});
