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

export function getAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_KEY);
  if (rawSession) {
    try {
      return JSON.parse(rawSession) as AuthSession;
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }

  const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY);
  return legacyToken ? { kind: "local", token: legacyToken } : null;
}

export function getAuthToken(): string | null {
  return getAuthSession()?.token ?? null;
}

export function setAuthSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.localStorage.setItem(LEGACY_TOKEN_KEY, session.token);
  window.dispatchEvent(new Event("diggit-auth-changed"));
}

export function clearAuthSession() {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.dispatchEvent(new Event("diggit-auth-changed"));
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function homeAuthHeaders(): Record<string, string> {
  const session = getAuthSession();
  return session?.kind === "federated" ? { authorization: `Bearer ${session.homeToken}` } : {};
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
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
