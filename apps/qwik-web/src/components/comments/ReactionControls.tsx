import { $, component$, type PropFunction, useComputed$, useSignal } from "@builder.io/qwik";

import type { CommentReaction } from "~/lib/api";

const EMOJI_OPTIONS = [
  { emoji: "👍", label: "thumbs up", keywords: "like approve yes" },
  { emoji: "👎", label: "thumbs down", keywords: "dislike no reject" },
  { emoji: "👏", label: "clap", keywords: "applause nice" },
  { emoji: "🙌", label: "raised hands", keywords: "celebrate hooray" },
  { emoji: "👀", label: "eyes", keywords: "watch looking review" },
  { emoji: "💡", label: "bulb", keywords: "idea suggestion" },
  { emoji: "❤️", label: "red heart", keywords: "love" },
  { emoji: "🚀", label: "rocket", keywords: "ship launch" },
  { emoji: "🐛", label: "bug", keywords: "issue defect" },
  { emoji: "✅", label: "check", keywords: "done pass" },
];

type ReactionControlsProps = {
  disabled?: boolean;
  onToggle$: PropFunction<(reaction: CommentReaction) => void>;
  reactions: CommentReaction[];
};

export const ReactionControls = component$(
  ({ disabled = false, onToggle$, reactions }: ReactionControlsProps) => {
    const isOpen = useSignal(false);
    const emojiSearch = useSignal("");
    const filteredEmojiOptions = useComputed$(() => {
      const normalized = emojiSearch.value.trim().toLowerCase();
      if (!normalized) {
        return EMOJI_OPTIONS;
      }
      return EMOJI_OPTIONS.filter((option) =>
        [option.emoji, option.label, option.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      );
    });

    const toggleReaction = $(async (reaction: CommentReaction) => {
      await onToggle$(reaction);
      isOpen.value = false;
      emojiSearch.value = "";
    });

    return (
      <div class="reaction-controls">
        {reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            class={[
              "reaction-controls__chip",
              reaction.viewer_reacted ? "reaction-controls__chip--active" : "",
            ]}
            disabled={disabled}
            title={`${reaction.viewer_reacted ? "Remove" : "Add"} ${reaction.emoji} reaction`}
            type="button"
            onClick$={() => toggleReaction(reaction)}
          >
            <span>{reaction.emoji}</span>
            {reaction.count > 0 ? (
              <span class="reaction-controls__count">{reaction.count}</span>
            ) : null}
          </button>
        ))}

        <div class="reaction-controls__picker">
          <button
            aria-expanded={isOpen.value}
            aria-label="Add emoji reaction"
            class="reaction-controls__add"
            disabled={disabled}
            type="button"
            onClick$={() => {
              isOpen.value = !isOpen.value;
              emojiSearch.value = "";
            }}
          >
            +
          </button>

          {isOpen.value ? (
            <div class="reaction-controls__menu">
              <input
                autoFocus
                class="reaction-controls__search"
                placeholder="Search emoji"
                value={emojiSearch.value}
                onInput$={(_, currentTarget) => {
                  emojiSearch.value = currentTarget.value;
                }}
              />
              <div class="reaction-controls__grid">
                {filteredEmojiOptions.value.map((option) => {
                  const existing = reactions.find(
                    (reaction) => reaction.emoji === option.emoji,
                  );
                  return (
                    <button
                      key={option.emoji}
                      class={[
                        "reaction-controls__emoji",
                        existing?.viewer_reacted
                          ? "reaction-controls__emoji--active"
                          : "",
                      ]}
                      title={option.label}
                      type="button"
                      onClick$={() =>
                        toggleReaction({
                          count: existing?.count ?? 0,
                          emoji: option.emoji,
                          viewer_reacted: existing?.viewer_reacted ?? false,
                        })
                      }
                    >
                      {option.emoji}
                    </button>
                  );
                })}
              </div>
              {filteredEmojiOptions.value.length === 0 ? (
                <p class="reaction-controls__empty">No emoji found.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);
