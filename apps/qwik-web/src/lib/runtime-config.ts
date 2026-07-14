declare const process: {
  env: Record<string, string | undefined>;
};

type DiggitRuntimeConfig = {
  publicApiUrl: string | null;
};

declare global {
  interface Window {
    __DIGGIT_RUNTIME_CONFIG__?: DiggitRuntimeConfig;
  }
}

export function browserRuntimePublicApiUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__DIGGIT_RUNTIME_CONFIG__?.publicApiUrl ?? undefined;
}

export function runtimeConfigScript() {
  const config: DiggitRuntimeConfig = {
    publicApiUrl: normalizeRuntimeUrl(
      runtimeEnv("PUBLIC_API_URL") ??
        runtimeEnv("PUBLIC_WEB_URL") ??
        runtimeEnv("APP_BASE_URL"),
    ),
  };

  return `window.__DIGGIT_RUNTIME_CONFIG__=${JSON.stringify(config)};`;
}

function normalizeRuntimeUrl(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.replace(/\/+$/, "") : null;
}

function runtimeEnv(key: string) {
  if (typeof process === "undefined") {
    return undefined;
  }

  return process.env[key];
}
