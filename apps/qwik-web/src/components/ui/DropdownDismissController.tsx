import { component$, useVisibleTask$ } from "@builder.io/qwik";

const DROPDOWN_SELECTOR = 'details[data-ui-dropdown="true"]';
const OPEN_DROPDOWN_SELECTOR = 'details[data-ui-dropdown="true"][open]';

export const DropdownDismissController = component$(() => {
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const closeOpenDropdowns = (except?: HTMLDetailsElement | null) => {
      document
        .querySelectorAll<HTMLDetailsElement>(OPEN_DROPDOWN_SELECTOR)
        .forEach((details) => {
          if (details !== except) {
            details.removeAttribute("open");
          }
        });
    };

    const closeOtherDropdowns = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement)) {
        return;
      }
      if (!target.open || !target.matches(DROPDOWN_SELECTOR)) {
        return;
      }

      closeOpenDropdowns(target);
    };

    const closeDropdownsOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      document
        .querySelectorAll<HTMLDetailsElement>(OPEN_DROPDOWN_SELECTOR)
        .forEach((details) => {
          if (!details.contains(target)) {
            details.removeAttribute("open");
          }
        });
    };

    const closeDropdownsOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      closeOpenDropdowns();
    };

    document.addEventListener("toggle", closeOtherDropdowns, true);
    document.addEventListener("pointerdown", closeDropdownsOnOutsideClick);
    window.addEventListener("keydown", closeDropdownsOnEscape);

    cleanup(() => {
      document.removeEventListener("toggle", closeOtherDropdowns, true);
      document.removeEventListener("pointerdown", closeDropdownsOnOutsideClick);
      window.removeEventListener("keydown", closeDropdownsOnEscape);
    });
  });

  return <></>;
});
