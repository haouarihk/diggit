import { $, component$, useSignal } from "@builder.io/qwik";

import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type RepositoryCompare } from "~/lib/api";

type SyncForkButtonProps = {
  disabled?: boolean;
  name: string;
  owner: string;
};

export const SyncForkButton = component$(
  ({ disabled = false, name, owner }: SyncForkButtonProps) => {
    const message = useSignal("");
    const isSyncing = useSignal(false);

    const sync = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to sync this fork.";
        return;
      }

      isSyncing.value = true;
      message.value = "";
      const response = await fetch(
        `${publicApiBaseUrl()}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/sync-upstream`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      isSyncing.value = false;

      if (!response.ok) {
        message.value = `Sync failed: ${response.status}`;
        return;
      }

      const body = (await response.json()) as RepositoryCompare;
      message.value =
        body.behind_by === 0
          ? "Fork synced."
          : "Sync completed with remaining differences.";
      window.location.reload();
    });

    return (
      <div class="sync-fork-button">
        <button
          class="settings-resource-panel__primary-button"
          disabled={disabled || isSyncing.value}
          type="button"
          onClick$={sync}
        >
          {isSyncing.value ? "Syncing..." : "Sync fork"}
        </button>
        {message.value ? <span class="sync-fork-button__message">{message.value}</span> : null}
      </div>
    );
  },
);
