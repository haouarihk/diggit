import {
  $,
  component$,
  isBrowser,
  useOnWindow,
  useSignal,
  useTask$,
} from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";
import { publicApiBaseUrl } from "~/lib/api";
import {
  clearAuthSession,
  getAuthToken,
  normalizeServerUrl,
  pkceChallenge,
  randomToken,
  setAuthSession,
} from "~/lib/auth-session";

type Mode = "login" | "register";

type FederatedExchangeResponse = {
  token: string;
  home_token: string;
  expires_at: string;
  user: {
    username: string;
    display_name: string;
    home_server: string | null;
  };
};

export const AuthPanel = component$(() => {
  const location = useLocation();
  const mode = useSignal<Mode>("login");
  const token = useSignal<string | null>(null);
  const message = useSignal("");
  const isSubmitting = useSignal(false);
  const searchParams = location.url.searchParams;
  const federatedClientId = searchParams.get("federated_client_id");
  const federatedRedirectUri = searchParams.get("federated_redirect_uri");
  const federatedAudience = searchParams.get("federated_audience");
  const federatedScope = searchParams.get("federated_scope");
  const federatedState = searchParams.get("federated_state");
  const federatedNonce = searchParams.get("federated_nonce");
  const federatedCodeChallenge = searchParams.get("federated_code_challenge");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  useTask$(() => {
    if (!isBrowser) {
      return;
    }

    token.value = getAuthToken();
  });

  useOnWindow(
    "diggit-auth-changed",
    $(() => {
      token.value = getAuthToken();
    }),
  );

  const authorizeFederatedLogin = $(async () => {
    const localToken = getAuthToken();
    if (
      !localToken ||
      !federatedClientId ||
      !federatedRedirectUri ||
      !federatedAudience ||
      !federatedScope ||
      !federatedState ||
      !federatedNonce ||
      !federatedCodeChallenge
    ) {
      message.value = "Sign in locally first to continue to another server.";
      return;
    }

    const response = await fetch(
      `${publicApiBaseUrl()}/auth/federated/authorize`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${localToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: federatedClientId,
          redirect_uri: federatedRedirectUri,
          audience: federatedAudience,
          scope: federatedScope,
          state: federatedState,
          nonce: federatedNonce,
          code_challenge: federatedCodeChallenge,
        }),
      },
    );

    if (!response.ok) {
      message.value = `Federated authorization failed: ${response.status}`;
      return;
    }

    const body = (await response.json()) as { redirect_uri: string };
    window.location.href = body.redirect_uri;
  });

  const beginFederatedLogin = $(async (event: SubmitEvent) => {
    const form = event.currentTarget as HTMLFormElement | null;
    if (!form) {
      return;
    }

    const data = new FormData(form);
    const homeServer = normalizeServerUrl(String(data.get("homeServer") ?? ""));
    if (!homeServer) {
      message.value = "Enter your home Diggit server.";
      return;
    }

    const verifier = randomToken();
    const challenge = await pkceChallenge(verifier);
    const nextState = randomToken();
    const nonce = randomToken();
    const redirectUri = `${window.location.origin}/auth/`;
    const pending = {
      homeServer,
      verifier,
      clientId: window.location.origin,
      redirectUri,
    };
    window.sessionStorage.setItem(
      `diggit_federated_${nextState}`,
      JSON.stringify(pending),
    );

    const params = new URLSearchParams({
      federated_client_id: window.location.origin,
      federated_redirect_uri: redirectUri,
      federated_audience: publicApiBaseUrl(),
      federated_scope: "repo:star repo:fork repo:issue repo:comment",
      federated_state: nextState,
      federated_nonce: nonce,
      federated_code_challenge: challenge,
    });
    window.location.href = `${homeServer}/auth?${params.toString()}`;
  });

  const finishFederatedLogin = $(async () => {
    if (!code || !state) {
      return;
    }

    const rawPending = window.sessionStorage.getItem(`diggit_federated_${state}`);
    if (!rawPending) {
      message.value =
        "Federated login state was not found. Start again from your server.";
      return;
    }

    const pending = JSON.parse(rawPending) as {
      homeServer: string;
      verifier: string;
      clientId: string;
      redirectUri: string;
    };
    const response = await fetch(`${publicApiBaseUrl()}/auth/federated/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        home_server: pending.homeServer,
        code,
        client_id: pending.clientId,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
      }),
    });

    if (!response.ok) {
      message.value = `Federated login failed: ${response.status}`;
      return;
    }

    const body = (await response.json()) as FederatedExchangeResponse;
    setAuthSession({
      kind: "federated",
      token: body.token,
      homeToken: body.home_token,
      homeServer: body.user.home_server ?? pending.homeServer,
      expiresAt: body.expires_at,
    });
    window.sessionStorage.removeItem(`diggit_federated_${state}`);
    token.value = body.token;
    message.value = `Signed in as ${body.user.display_name} from ${body.user.home_server ?? pending.homeServer}`;
  });

  const submit = $(async (event: SubmitEvent) => {
    const form = event.currentTarget as HTMLFormElement | null;
    if (!form) {
      return;
    }

    const data = new FormData(form);
    const payload = {
      username: String(data.get("username") ?? ""),
      display_name: String(data.get("displayName") ?? ""),
      password: String(data.get("password") ?? ""),
    };

    isSubmitting.value = true;

    try {
      const response = await fetch(`${publicApiBaseUrl()}/auth/${mode.value}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        message.value = body?.error ?? `Request failed with ${response.status}`;
        return;
      }

      const body = (await response.json()) as {
        token: string;
        user: { username: string };
      };
      setAuthSession({ kind: "local", token: body.token });
      token.value = body.token;
      message.value = `Signed in as ${body.user.username}`;
    } finally {
      isSubmitting.value = false;
    }
  });

  const signOut = $(() => {
    clearAuthSession();
    token.value = null;
    message.value = "Signed out";
  });

  return (
    <section class="auth-panel">
      <div class="auth-panel__actions">
        <button
          class="auth-panel__button"
          type="button"
          onClick$={() => {
            mode.value = "login";
          }}
        >
          Login
        </button>
        <button
          class="auth-panel__button"
          type="button"
          onClick$={() => {
            mode.value = "register";
          }}
        >
          Register
        </button>
        {token.value ? (
          <button class="auth-panel__button" type="button" onClick$={signOut}>
            Sign out
          </button>
        ) : null}
      </div>

      {federatedClientId ? (
        <section class="auth-panel__subsection auth-panel__subsection--muted">
          <h2 class="auth-panel__subtitle">Continue to another Diggit server</h2>
          <p class="auth-panel__help">
            Authorize {federatedAudience} to use this identity for scoped repo
            actions.
          </p>
          <button
            class="auth-panel__button"
            type="button"
            onClick$={authorizeFederatedLogin}
          >
            Continue
          </button>
        </section>
      ) : null}

      {code && state ? (
        <section class="auth-panel__subsection auth-panel__subsection--muted">
          <h2 class="auth-panel__subtitle">Finish federated login</h2>
          <button
            class="auth-panel__button"
            type="button"
            onClick$={finishFederatedLogin}
          >
            Finish sign in
          </button>
        </section>
      ) : null}

      <form class="auth-form" onSubmit$={submit} preventdefault:submit>
        <label class="auth-form__label">
          Username
          <input class="auth-form__input" name="username" required />
        </label>
        {mode.value === "register" ? (
          <label class="auth-form__label">
            Display name
            <input class="auth-form__input" name="displayName" />
          </label>
        ) : null}
        <label class="auth-form__label">
          Password
          <input
            class="auth-form__input"
            name="password"
            required
            type="password"
          />
        </label>
        <button class="auth-panel__button" disabled={isSubmitting.value} type="submit">
          {mode.value === "login" ? "Login" : "Create account"}
        </button>
      </form>

      <form
        class="auth-form auth-form--separated"
        onSubmit$={beginFederatedLogin}
        preventdefault:submit
      >
        <h2 class="auth-panel__subtitle">Continue with another Diggit server</h2>
        <label class="auth-form__label">
          Home server
          <input
            class="auth-form__input"
            name="homeServer"
            placeholder="https://git.example.com"
            required
          />
        </label>
        <button class="auth-panel__button" type="submit">
          Continue
        </button>
      </form>

      {message.value ? <p class="auth-panel__message">{message.value}</p> : null}
      {token.value ? (
        <p class="auth-panel__message">
          Token stored locally for repo actions.
        </p>
      ) : null}
    </section>
  );
});
