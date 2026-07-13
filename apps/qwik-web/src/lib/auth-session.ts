export type AuthSession =
  | {
      kind: "local";
      token: string;
    }
  | {
      kind: "federated";
      token: string;
      homeToken: string;
      homeServer: string;
      expiresAt: string;
    };

const SESSION_KEY = "diggit_session";
const LEGACY_TOKEN_KEY = "diggit_token";
const COOKIE_TOKEN_KEY = "diggit_token";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_KEY);
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession) as AuthSession;
      persistAuthCookie(session.token);
      return session;
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }

  const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken) {
    persistAuthCookie(legacyToken);
    return { kind: "local", token: legacyToken };
  }

  return null;
}

export function getAuthToken() {
  return getAuthSession()?.token ?? null;
}

export function setAuthSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.localStorage.setItem(LEGACY_TOKEN_KEY, session.token);
  persistAuthCookie(session.token);
  window.dispatchEvent(new Event("diggit-auth-changed"));
}

export function clearAuthSession() {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  clearAuthCookie();
  window.dispatchEvent(new Event("diggit-auth-changed"));
}

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function pkceChallenge(verifier: string) {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function persistAuthCookie(token: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${COOKIE_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearAuthCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${COOKIE_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}
