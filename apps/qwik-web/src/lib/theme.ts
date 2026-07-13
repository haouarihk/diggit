export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "diggit_theme";
export const THEME_EVENT = "diggit-theme-changed";

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function applyTheme(preference: ThemePreference) {
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const value =
      window.localStorage.getItem(THEME_STORAGE_KEY) ??
      document.documentElement.dataset.themePreference;
    return value === "light" || value === "dark" || value === "system"
      ? value
      : "system";
  } catch {
    return document.documentElement.dataset.themePreference === "dark" ||
      document.documentElement.dataset.themePreference === "light" ||
      document.documentElement.dataset.themePreference === "system"
      ? (document.documentElement.dataset.themePreference as ThemePreference)
      : "system";
  }
}

export function setThemePreference(preference: ThemePreference) {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function themeInitScript() {
  return `
(() => {
  const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const readPreference = () => {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === "light" || value === "dark" || value === "system" ? value : "system";
    } catch {
      return "system";
    }
  };

  const applyTheme = (preference) => {
    const resolvedTheme =
      preference === "dark" || (preference === "system" && mediaQuery.matches)
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = preference;
  };

  const syncSystemTheme = () => {
    if (readPreference() === "system") {
      applyTheme("system");
    }
  };

  applyTheme(readPreference());

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", syncSystemTheme);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(syncSystemTheme);
  }
})();
`;
}
