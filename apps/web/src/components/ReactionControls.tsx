"use client";

import type { CommentReaction } from "@/lib/api";
import { SmilePlus } from "lucide-react";
import { useState } from "react";

const EMOJI_OPTIONS = [
  { emoji: "👍", label: "thumbs up", keywords: "like approve yes" },
  { emoji: "👎", label: "thumbs down", keywords: "dislike no reject" },
  { emoji: "👌", label: "ok hand", keywords: "ok perfect" },
  { emoji: "👏", label: "clap", keywords: "applause nice" },
  { emoji: "🙌", label: "raised hands", keywords: "celebrate hooray" },
  { emoji: "🙏", label: "pray", keywords: "please thanks" },
  { emoji: "🤝", label: "handshake", keywords: "deal agreement" },
  { emoji: "💪", label: "muscle", keywords: "strong effort" },
  { emoji: "👀", label: "eyes", keywords: "watch looking review" },
  { emoji: "🧠", label: "brain", keywords: "smart idea think" },
  { emoji: "💅", label: "polish", keywords: "style clean" },
  { emoji: "😄", label: "smile", keywords: "happy laugh" },
  { emoji: "😁", label: "grin", keywords: "happy smile" },
  { emoji: "😂", label: "joy", keywords: "laugh funny" },
  { emoji: "🤣", label: "rolling laugh", keywords: "funny lol" },
  { emoji: "😊", label: "blush", keywords: "happy nice" },
  { emoji: "😍", label: "heart eyes", keywords: "love awesome" },
  { emoji: "🥰", label: "smiling hearts", keywords: "love thanks" },
  { emoji: "😎", label: "cool", keywords: "sunglasses" },
  { emoji: "🤔", label: "thinking", keywords: "question consider" },
  { emoji: "😕", label: "confused", keywords: "unsure concern" },
  { emoji: "😢", label: "cry", keywords: "sad" },
  { emoji: "😭", label: "sob", keywords: "sad cry" },
  { emoji: "😡", label: "angry", keywords: "mad issue" },
  { emoji: "🤯", label: "mind blown", keywords: "wow surprise" },
  { emoji: "😱", label: "scream", keywords: "shock" },
  { emoji: "🥳", label: "party face", keywords: "celebrate" },
  { emoji: "🎉", label: "party popper", keywords: "celebrate ship" },
  { emoji: "✨", label: "sparkles", keywords: "new shiny" },
  { emoji: "🔥", label: "fire", keywords: "hot great" },
  { emoji: "💯", label: "hundred", keywords: "perfect agree" },
  { emoji: "✅", label: "check", keywords: "done pass" },
  { emoji: "❌", label: "cross", keywords: "fail no" },
  { emoji: "⚠️", label: "warning", keywords: "caution risk" },
  { emoji: "🚀", label: "rocket", keywords: "ship launch" },
  { emoji: "🐛", label: "bug", keywords: "issue defect" },
  { emoji: "🛠️", label: "tools", keywords: "fix work" },
  { emoji: "📌", label: "pin", keywords: "important" },
  { emoji: "📎", label: "paperclip", keywords: "attachment file" },
  { emoji: "📝", label: "memo", keywords: "notes docs" },
  { emoji: "📚", label: "books", keywords: "docs learn" },
  { emoji: "🔍", label: "search", keywords: "inspect review" },
  { emoji: "💡", label: "bulb", keywords: "idea suggestion" },
  { emoji: "💬", label: "speech bubble", keywords: "comment chat" },
  { emoji: "❤️", label: "red heart", keywords: "love" },
  { emoji: "🧡", label: "orange heart", keywords: "love" },
  { emoji: "💛", label: "yellow heart", keywords: "love" },
  { emoji: "💚", label: "green heart", keywords: "love" },
  { emoji: "💙", label: "blue heart", keywords: "love" },
  { emoji: "💜", label: "purple heart", keywords: "love" },
  { emoji: "🖤", label: "black heart", keywords: "love" },
  { emoji: "🤍", label: "white heart", keywords: "love" },
  { emoji: "⭐", label: "star", keywords: "favorite" },
  { emoji: "🌟", label: "glowing star", keywords: "favorite great" },
  { emoji: "🏆", label: "trophy", keywords: "win" },
  { emoji: "🍕", label: "pizza", keywords: "food" },
  { emoji: "☕", label: "coffee", keywords: "drink" },
  { emoji: "🍻", label: "beers", keywords: "cheers" },
  { emoji: "🌈", label: "rainbow", keywords: "color" },
  { emoji: "🎯", label: "target", keywords: "goal focus" },
  { emoji: "⏳", label: "hourglass", keywords: "waiting time" },
  { emoji: "⌛", label: "hourglass done", keywords: "time" },
  { emoji: "🔒", label: "lock", keywords: "secure" },
  { emoji: "🔓", label: "unlock", keywords: "open" },
  { emoji: "📦", label: "package", keywords: "release bundle" },
  { emoji: "🧪", label: "test tube", keywords: "test experiment" },
  { emoji: "🧹", label: "broom", keywords: "cleanup" },
  { emoji: "🔧", label: "wrench", keywords: "fix tool" },
  { emoji: "🎨", label: "palette", keywords: "design" },
  { emoji: "⚡", label: "zap", keywords: "fast performance" },
  { emoji: "🌍", label: "globe", keywords: "world server federation" },
  { emoji: "📣", label: "megaphone", keywords: "announce" },
];

type ReactionControlsProps = {
  disabled?: boolean;
  reactions: CommentReaction[];
  onToggle: (reaction: CommentReaction) => void;
};

export function ReactionControls({ disabled = false, onToggle, reactions }: ReactionControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const filteredEmojiOptions = emojiOptionsForSearch(emojiSearch);

  function toggleReaction(reaction: CommentReaction) {
    onToggle(reaction);
    setIsOpen(false);
    setEmojiSearch("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map((reaction) => (
        <button
          className={`rounded-full border px-2 py-1 text-sm ${
            reaction.viewer_reacted ? "border-[#0969da] bg-[#ddf4ff] text-[#0969da]" : "border-[#d0d7de] bg-[#f6f8fa] text-[#24292f]"
          } disabled:opacity-60`}
          disabled={disabled}
          key={reaction.emoji}
          title={`${reaction.viewer_reacted ? "Remove" : "Add"} ${reaction.emoji} reaction`}
          type="button"
          onClick={() => toggleReaction(reaction)}
        >
          <span>{reaction.emoji}</span>
          {reaction.count > 0 ? <span className="ml-1 font-semibold">{reaction.count}</span> : null}
        </button>
      ))}
      <div className="relative">
        <button
          aria-expanded={isOpen}
          aria-label="Add emoji reaction"
          className="grid h-8 w-8 place-items-center rounded-full border border-[#d0d7de] bg-white text-[#59636e] hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] disabled:opacity-60"
          disabled={disabled}
          title="Add reaction"
          type="button"
          onClick={() => {
            setIsOpen((current) => !current);
            setEmojiSearch("");
          }}
        >
          <SmilePlus aria-hidden="true" size={16} />
        </button>
        {isOpen ? (
          <div className="absolute bottom-full left-0 z-10 mb-2 grid w-72 gap-2 rounded-xl border border-[#d0d7de] bg-white p-3 shadow-lg">
            <input
              autoFocus
              className="w-full rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
              placeholder="Search emoji"
              value={emojiSearch}
              onChange={(event) => setEmojiSearch(event.target.value)}
            />
            <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto pr-1">
              {filteredEmojiOptions.map((option) => {
                const existing = reactions.find((reaction) => reaction.emoji === option.emoji);
                return (
                  <button
                    className={`grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-[#f6f8fa] ${existing?.viewer_reacted ? "bg-[#ddf4ff] ring-1 ring-[#0969da]" : ""}`}
                    key={option.emoji}
                    title={option.label}
                    type="button"
                    onClick={() =>
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
            {filteredEmojiOptions.length === 0 ? <p className="text-sm text-[#59636e]">No emoji found.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function emojiOptionsForSearch(search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return EMOJI_OPTIONS;
  }
  return EMOJI_OPTIONS.filter((option) => [option.emoji, option.label, option.keywords].join(" ").toLowerCase().includes(normalized));
}
