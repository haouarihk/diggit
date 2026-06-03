import { afterEach, describe, expect, it, vi } from "vitest";
import { apiBaseUrl, apiUrl } from "./runtime-config";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
});

describe("runtime config", () => {
  it("uses browser-injected API URL at runtime", () => {
    vi.stubGlobal("window", {
      __DIGGIT_CONFIG__: { apiUrl: "https://git.example.com/api/" },
    });

    expect(apiBaseUrl()).toBe("https://git.example.com/api");
    expect(apiUrl("/auth/login")).toBe("https://git.example.com/api/auth/login");
  });

  it("uses server runtime API_URL when rendering config", () => {
    process.env.API_URL = "https://api.example.com/";

    expect(apiBaseUrl()).toBe("https://api.example.com");
  });
});
