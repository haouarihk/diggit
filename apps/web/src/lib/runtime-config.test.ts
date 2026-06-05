import { afterEach, describe, expect, it, vi } from "vitest";
import { apiBaseUrl, apiUrl, publicApiBaseUrl, runtimeConfigScript } from "./runtime-config";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
  delete process.env.API_INTERNAL_URL;
  delete process.env.PUBLIC_API_URL;
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

  it("uses internal API URL for server-side fetches", () => {
    process.env.API_URL = "https://public-api.example.com";
    process.env.API_INTERNAL_URL = "http://api:3001";

    expect(apiBaseUrl()).toBe("http://api:3001");
  });

  it("injects the public API URL for browser requests", () => {
    process.env.API_INTERNAL_URL = "http://api:3001";
    process.env.PUBLIC_API_URL = "https://public-api.example.com/";

    expect(publicApiBaseUrl()).toBe("https://public-api.example.com");
    expect(runtimeConfigScript()).toContain("https://public-api.example.com");
  });
});
