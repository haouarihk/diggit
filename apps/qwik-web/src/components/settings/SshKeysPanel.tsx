import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import { Drawer } from "~/components/ui/Drawer";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type SshKey = {
  id: string;
  title: string;
  fingerprint: string;
  created_at: string;
};

export const SshKeysPanel = component$(() => {
  const keys = useSignal<SshKey[]>([]);
  const message = useSignal("");
  const isAddKeyOpen = useSignal(false);

  const loadKeys = $(async () => {
    const token = getAuthToken();
    if (!token) {
      keys.value = [];
      message.value = "Sign in to manage SSH keys.";
      return;
    }

    const response = await fetch(`${publicApiBaseUrl()}/user/keys`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      message.value = `Failed to load keys: ${response.status}`;
      return;
    }

    const body = (await response.json()) as { data: SshKey[] };
    keys.value = body.data;
    message.value = "";
  });

  useTask$(async () => {
    if (!isBrowser || !getAuthToken()) {
      return;
    }
    await loadKeys();
  });

  const submit = $(async (_event: SubmitEvent, formElement: HTMLFormElement) => {
    const token = getAuthToken();
    if (!token) {
      message.value = "Sign in to add SSH keys.";
      return;
    }

    const form = new FormData(formElement);
    const response = await fetch(`${publicApiBaseUrl()}/user/keys`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: form.get("title"),
        public_key: form.get("publicKey"),
      }),
    });

    if (!response.ok) {
      message.value = `Failed to add SSH key: ${response.status}`;
      return;
    }

    message.value = "SSH key added.";
    formElement.reset();
    isAddKeyOpen.value = false;
    await loadKeys();
  });

  const removeKey = $(async (id: string) => {
    const token = getAuthToken();
    if (!token) {
      message.value = "Sign in to remove SSH keys.";
      return;
    }

    await fetch(`${publicApiBaseUrl()}/user/keys/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    await loadKeys();
  });

  return (
    <section class="settings-resource-panel">
      <div class="settings-resource-panel__header">
        <strong>SSH keys</strong>
        <div class="settings-resource-panel__actions">
          <button
            class="settings-resource-panel__secondary-button"
            type="button"
            onClick$={loadKeys}
          >
            Refresh
          </button>
          <button
            class="settings-resource-panel__primary-button"
            type="button"
            onClick$={() => {
              isAddKeyOpen.value = true;
            }}
          >
            Add key
          </button>
        </div>
      </div>

      <Drawer
        isOpen={isAddKeyOpen.value}
        onClose$={$(() => {
          isAddKeyOpen.value = false;
        })}
        subtitle="SSH keys"
        title="Add SSH key"
      >
        <form
          class="settings-drawer-form"
          onSubmit$={submit}
          preventdefault:submit
        >
          <label class="settings-drawer-form__label">
            Title
            <input class="settings-drawer-form__input" name="title" required />
          </label>
          <label class="settings-drawer-form__label">
            Public key
            <textarea
              class="settings-drawer-form__textarea"
              name="publicKey"
              required
            />
          </label>
          <div class="settings-drawer-form__actions">
            <button
              class="settings-resource-panel__secondary-button"
              type="button"
              onClick$={() => {
                isAddKeyOpen.value = false;
              }}
            >
              Cancel
            </button>
            <button class="settings-resource-panel__primary-button" type="submit">
              Add key
            </button>
          </div>
        </form>
      </Drawer>

      {message.value ? (
        <div class="settings-resource-panel__message">{message.value}</div>
      ) : null}
      <div class="settings-resource-panel__body">
        {keys.value.length === 0 ? (
          <div class="settings-resource-panel__empty">
            No keys loaded yet. Refresh after signing in.
          </div>
        ) : (
          keys.value.map((key) => (
            <article class="settings-resource-item" key={key.id}>
              <strong>{key.title}</strong>
              <span class="settings-resource-item__mono">{key.fingerprint}</span>
              <button
                class="settings-resource-item__delete"
                type="button"
                onClick$={() => removeKey(key.id)}
              >
                Delete
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
});
