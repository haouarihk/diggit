import { $, component$, isBrowser, useSignal, useTask$ } from "@builder.io/qwik";
import { getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl } from "~/lib/api";

type OAuthToken = {
  id: string;
  application_id: string;
  application_name: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export const OAuthTokensPanel = component$(() => {
  const tokens = useSignal<OAuthToken[]>([]);
  const message = useSignal("");

  const loadTokens = $(async () => {
    const token = getAuthToken();
    if (!token) {
      tokens.value = [];
      message.value = "Sign in to review OAuth tokens.";
      return;
    }

    const response = await fetch(`${publicApiBaseUrl()}/oauth/tokens`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      message.value = `Failed to load OAuth tokens: ${response.status}`;
      return;
    }

    const body = (await response.json()) as { data: OAuthToken[] };
    tokens.value = body.data;
    message.value = "";
  });

  useTask$(async () => {
    if (!isBrowser || !getAuthToken()) {
      return;
    }
    await loadTokens();
  });

  const revokeToken = $(async (tokenRecord: OAuthToken) => {
    const token = getAuthToken();
    if (!token) {
      message.value = "Sign in to revoke OAuth tokens.";
      return;
    }

    const response = await fetch(
      `${publicApiBaseUrl()}/oauth/tokens/${tokenRecord.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) {
      message.value = `Failed to revoke token: ${response.status}`;
      return;
    }

    message.value = `Revoked ${tokenRecord.application_name}.`;
    await loadTokens();
  });

  return (
    <section class="settings-resource-panel">
      <div class="settings-resource-panel__header">
        <strong>Authorized OAuth tokens</strong>
        <button
          class="settings-resource-panel__secondary-button"
          type="button"
          onClick$={loadTokens}
        >
          Refresh
        </button>
      </div>
      {message.value ? (
        <div class="settings-resource-panel__message">{message.value}</div>
      ) : null}
      <div class="settings-resource-panel__body">
        {tokens.value.length === 0 ? (
          <div class="settings-resource-panel__empty">No OAuth tokens yet.</div>
        ) : (
          tokens.value.map((tokenRecord) => (
            <article class="settings-resource-item" key={tokenRecord.id}>
              <div class="oauth-panel__application-header">
                <div>
                  <strong>{tokenRecord.application_name}</strong>
                  <p class="oauth-panel__subtle">
                    Scopes: {tokenRecord.scopes.join(", ")}
                  </p>
                </div>
                <button
                  class="oauth-panel__danger-button"
                  disabled={tokenRecord.revoked_at !== null}
                  type="button"
                  onClick$={() => revokeToken(tokenRecord)}
                >
                  {tokenRecord.revoked_at ? "Revoked" : "Revoke"}
                </button>
              </div>
              <div class="oauth-token__grid">
                <span>Created: {formatDateTime(tokenRecord.created_at)}</span>
                <span>Expires: {formatDateTime(tokenRecord.expires_at)}</span>
                <span>
                  Last used:{" "}
                  {tokenRecord.last_used_at
                    ? formatDateTime(tokenRecord.last_used_at)
                    : "Never"}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
});

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
