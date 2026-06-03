const DEFAULT_API_URL = "http://localhost:3001";

declare const process: {
  env: Record<string, string | undefined>;
};

declare global {
  interface Window {
    __DIGGIT_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

export function apiBaseUrl() {
  if (typeof window !== "undefined") {
    return normalizeApiUrl(window.__DIGGIT_CONFIG__?.apiUrl);
  }

  return normalizeApiUrl(process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"]);
}

export function apiUrl(path: string) {
  return `${apiBaseUrl()}${path}`;
}

export function runtimeConfigScript() {
  return `window.__DIGGIT_CONFIG__=${JSON.stringify({ apiUrl: apiBaseUrl() })};`;
}

function normalizeApiUrl(value: string | undefined) {
  return (value?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
}
