import { $, component$, useSignal } from "@builder.io/qwik";

export const OrganizationFollowButton = component$(() => {
  const isFollowing = useSignal(false);

  return (
    <button
      aria-pressed={isFollowing.value}
      class="organization-follow-button"
      type="button"
      onClick$={$(() => {
        isFollowing.value = !isFollowing.value;
      })}
    >
      {isFollowing.value ? "Following" : "Follow"}
    </button>
  );
});
