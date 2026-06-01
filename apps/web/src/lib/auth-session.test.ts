import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAuthSession, getAuthSession, getAuthToken, normalizeServerUrl, setAuthSession } from "./auth-session";

function mockWindow() {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    dispatchEvent: vi.fn(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth session", () => {
  it("stores and reads federated session metadata", () => {
    mockWindow();

    setAuthSession({
      kind: "federated",
      token: "visited-token",
      homeToken: "home-token",
      homeServer: "https://home.example.com",
      expiresAt: "2026-06-01T00:00:00Z",
    });

    expect(getAuthToken()).toBe("visited-token");
    expect(getAuthSession()).toEqual({
      kind: "federated",
      token: "visited-token",
      homeToken: "home-token",
      homeServer: "https://home.example.com",
      expiresAt: "2026-06-01T00:00:00Z",
    });
  });

  it("falls back to legacy local token and clears both formats", () => {
    mockWindow();
    window.localStorage.setItem("diggit_token", "legacy-token");

    expect(getAuthSession()).toEqual({ kind: "local", token: "legacy-token" });

    clearAuthSession();
    expect(getAuthSession()).toBeNull();
  });

  it("normalizes home server input", () => {
    expect(normalizeServerUrl("git.example.com/")).toBe("https://git.example.com");
    expect(normalizeServerUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });
});
