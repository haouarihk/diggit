import { $, component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import {
  THEME_EVENT,
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from "~/lib/theme";

const OPTIONS = [
  { id: "system", label: "System", icon: "◐", description: "Match your device" },
  { id: "light", label: "Light", icon: "☼", description: "Bright interface" },
  { id: "dark", label: "Dark", icon: "☾", description: "Dim interface" },
] as const;

export const ThemeToggle = component$(() => {
  const preference = useSignal<ThemePreference>("system");

  const syncPreference = $(() => {
    preference.value = getThemePreference();
  });

  const selectTheme = $((nextPreference: ThemePreference, target: HTMLButtonElement) => {
    setThemePreference(nextPreference);
    preference.value = nextPreference;
    target.closest("details")?.removeAttribute("open");
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    syncPreference();

    const updatePreference = () => {
      syncPreference();
    };

    window.addEventListener(THEME_EVENT, updatePreference);

    return () => {
      window.removeEventListener(THEME_EVENT, updatePreference);
    };
  });

  const selected = OPTIONS.find((option) => option.id === preference.value) ?? OPTIONS[0];

  return (
    <details class="theme-toggle" data-ui-dropdown="true">
      <summary class="theme-toggle__summary">
        <span class="theme-toggle__selected-icon">{selected.icon}</span>
        <span class="theme-toggle__selected-label">{selected.label}</span>
        <span class="theme-toggle__selected-caret">▾</span>
      </summary>
      <div class="theme-toggle__menu">
        <div class="theme-toggle__header">
          <div class="theme-toggle__title">Theme</div>
          <div class="theme-toggle__subtitle">Choose how Diggit looks.</div>
        </div>
        <div class="theme-toggle__options">
          {OPTIONS.map((option) => {
            const active = option.id === preference.value;

            return (
              <button
                class={{
                  "theme-toggle__option": true,
                  "theme-toggle__option--active": active,
                }}
                key={option.id}
                type="button"
                onClick$={(_, target) => selectTheme(option.id, target)}
              >
                <span class="theme-toggle__option-icon">{option.icon}</span>
                <span class="theme-toggle__option-copy">
                  <span class="theme-toggle__option-label">{option.label}</span>
                  <span class="theme-toggle__option-description">
                    {option.description}
                  </span>
                </span>
                {active ? <span class="theme-toggle__option-check">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
});
