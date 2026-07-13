import {
  $,
  type PropFunction,
  Slot,
  component$,
  isBrowser,
  useOnWindow,
  useTask$,
} from "@builder.io/qwik";

type DrawerProps = {
  isOpen: boolean;
  onClose$: PropFunction<() => void>;
  subtitle?: string;
  title: string;
};

export const Drawer = component$(
  ({ isOpen, onClose$, subtitle, title }: DrawerProps) => {
    useTask$(({ track, cleanup }) => {
      track(() => isOpen);
      if (!isBrowser || !isOpen) {
        return;
      }

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      cleanup(() => {
        document.body.style.overflow = previousOverflow;
      });
    });

    useOnWindow(
      "keydown",
      $((event) => {
        if (!isOpen || event.key !== "Escape") {
          return;
        }
        return onClose$();
      }),
    );

    if (!isOpen) {
      return null;
    }

    return (
      <div
        aria-labelledby="drawer-title"
        aria-modal="true"
        class="ui-drawer"
        role="dialog"
      >
        <div class="ui-drawer__content">
          <div class="ui-drawer__header">
            <div>
              {subtitle ? <p class="ui-drawer__subtitle">{subtitle}</p> : null}
              <h2 class="ui-drawer__title" id="drawer-title">
                {title}
              </h2>
            </div>
            <button
              autoFocus
              class="ui-drawer__close"
              type="button"
              onClick$={onClose$}
            >
              Close
            </button>
          </div>
          <Slot />
        </div>
      </div>
    );
  },
);
