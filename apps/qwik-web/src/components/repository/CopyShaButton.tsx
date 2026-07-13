import { $, component$, useSignal } from "@builder.io/qwik";

type CopyShaButtonProps = {
  sha: string;
};

export const CopyShaButton = component$(({ sha }: CopyShaButtonProps) => {
  const copied = useSignal(false);

  const copySha = $(async () => {
    await navigator.clipboard.writeText(sha);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1200);
  });

  return (
    <button
      aria-label="Copy full SHA"
      class="copy-sha-button"
      title={copied.value ? "Copied" : "Copy full SHA"}
      type="button"
      onClick$={copySha}
    >
      {copied.value ? "✓" : "⧉"}
    </button>
  );
});
