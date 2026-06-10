"use client";

import { Drawer } from "@/components/Drawer";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { authHeaders } from "@/lib/auth-session";
import type { CommentAttachment, CommentReaction, IssueComment } from "@/lib/api";
import { SmilePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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

type ConversationPanelProps = {
  attachmentUploadUrl: string;
  comments: IssueComment[];
  commentsUrl: string;
  emptyLabel?: string;
  title?: string;
};

export function ConversationPanel({
  attachmentUploadUrl,
  comments: initialComments,
  commentsUrl,
  emptyLabel = "No comments yet.",
  title = "Conversation",
}: ConversationPanelProps) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [message, setMessage] = useState("");
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editAttachments, setEditAttachments] = useState<CommentAttachment[]>([]);
  const [newBody, setNewBody] = useState("");
  const [newAttachments, setNewAttachments] = useState<CommentAttachment[]>([]);
  const [pendingDelete, setPendingDelete] = useState<IssueComment | null>(null);
  const [emojiPickerCommentId, setEmojiPickerCommentId] = useState<string | null>(null);
  const [emojiSearch, setEmojiSearch] = useState("");

  async function refreshComments() {
    const response = await fetch(`${commentsUrl}?limit=100`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to refresh comments: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: IssueComment[] };
    setComments(body.data);
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        attachment_ids: newAttachments.map((attachment) => attachment.id),
        body: newBody,
      }),
    });
    if (!response.ok) {
      setMessage(`Failed to comment: ${response.status}`);
      return;
    }
    setNewBody("");
    setNewAttachments([]);
    await refreshComments();
    setMessage("Comment added.");
    router.refresh();
  }

  async function saveComment(event: FormEvent<HTMLFormElement>, commentId: string) {
    event.preventDefault();
    setCommentBusyId(commentId);
    const response = await fetch(`${commentsUrl}/${encodeURIComponent(commentId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        attachment_ids: editAttachments.map((attachment) => attachment.id),
        body: editBody,
      }),
    });
    setCommentBusyId(null);
    if (!response.ok) {
      setMessage(`Failed to edit comment: ${response.status}`);
      return;
    }
    const updated = (await response.json()) as IssueComment;
    setComments((current) => current.map((comment) => (comment.id === updated.id ? updated : comment)));
    setEditingCommentId(null);
    setEditBody("");
    setEditAttachments([]);
    setMessage("Comment updated.");
    router.refresh();
  }

  async function deleteComment() {
    if (!pendingDelete) {
      return;
    }
    setCommentBusyId(pendingDelete.id);
    const response = await fetch(`${commentsUrl}/${encodeURIComponent(pendingDelete.id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setCommentBusyId(null);
    if (!response.ok) {
      setMessage(`Failed to delete comment: ${response.status}`);
      return;
    }
    const updated = (await response.json()) as IssueComment;
    setComments((current) => current.map((comment) => (comment.id === updated.id ? updated : comment)));
    setPendingDelete(null);
    setMessage("Comment deleted.");
    router.refresh();
  }

  async function toggleReaction(comment: IssueComment, reaction: CommentReaction) {
    setCommentBusyId(comment.id);
    const response = await fetch(`${commentsUrl}/${encodeURIComponent(comment.id)}/reactions`, {
      method: reaction.viewer_reacted ? "DELETE" : "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ emoji: reaction.emoji }),
    });
    setCommentBusyId(null);
    if (!response.ok) {
      setMessage(`Failed to update reaction: ${response.status}`);
      return;
    }
    const updated = (await response.json()) as IssueComment;
    setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEmojiPickerCommentId(null);
    setEmojiSearch("");
  }

  const filteredEmojiOptions = emojiOptionsForSearch(emojiSearch);

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{title}</h2>
      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
      {comments.length === 0 ? (
        <p className="rounded-xl border border-[#d0d7de] bg-white p-4 text-[#59636e]">{emptyLabel}</p>
      ) : (
        comments.map((comment) => (
          <div className="flex items-start gap-3" key={comment.id}>
            <Avatar comment={comment} />
            <article className="relative grid min-w-0 flex-1 gap-3 rounded-2xl border border-[#d0d7de] bg-white p-4 shadow-sm before:absolute before:left-[-7px] before:top-5 before:h-3 before:w-3 before:rotate-45 before:border-b before:border-l before:border-[#d0d7de] before:bg-white before:content-['']">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#d8dee4] pb-3">
                  <AuthorLink comment={comment} />
                  <span className="text-sm text-[#59636e]">commented {formatDate(comment.created_at)}</span>
                  {comment.remote_server ? <span className="rounded-full bg-[#f6f8fa] px-2 py-0.5 text-xs font-semibold text-[#59636e]">{comment.remote_server}</span> : null}
                  {comment.updated_at !== comment.created_at && !comment.deleted_at ? <span className="text-xs text-[#59636e]">edited</span> : null}
                </div>
                <div className="pt-3">
                  {comment.deleted_at ? (
                    <p className="text-sm italic text-[#59636e]">This comment was deleted.</p>
                  ) : editingCommentId === comment.id ? (
                    <MarkdownEditor
                      attachments={editAttachments}
                      disabled={commentBusyId === comment.id}
                      label="Edit comment"
                      submitLabel={commentBusyId === comment.id ? "Saving..." : "Save"}
                      uploadUrl={attachmentUploadUrl}
                      value={editBody}
                      onAttachmentsChange={setEditAttachments}
                      onCancel={() => {
                        setEditingCommentId(null);
                        setEditBody("");
                        setEditAttachments([]);
                      }}
                      onChange={setEditBody}
                      onSubmit={(event) => void saveComment(event, comment.id)}
                    />
                  ) : (
                    <>
                      <MarkdownViewer content={comment.body} sanitizedHtml={comment.body_html} variant="comment" />
                      <AttachmentList attachments={comment.attachments} />
                    </>
                  )}
                </div>
              </div>

              {!comment.deleted_at ? (
                <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                    {comment.reactions.map((reaction) => (
                      <button
                        className={`rounded-full border px-2 py-1 text-sm ${
                          reaction.viewer_reacted
                            ? "border-[#0969da] bg-[#ddf4ff] text-[#0969da]"
                            : "border-[#d0d7de] bg-[#f6f8fa] text-[#24292f]"
                        } disabled:opacity-60`}
                        disabled={commentBusyId === comment.id}
                        key={reaction.emoji}
                        title={`${reaction.viewer_reacted ? "Remove" : "Add"} ${reaction.emoji} reaction`}
                        type="button"
                        onClick={() => void toggleReaction(comment, reaction)}
                      >
                        <span>{reaction.emoji}</span>
                        {reaction.count > 0 ? <span className="ml-1 font-semibold">{reaction.count}</span> : null}
                      </button>
                    ))}
                  <div className="relative">
                    <button
                      aria-expanded={emojiPickerCommentId === comment.id}
                      aria-label="Add emoji reaction"
                      className="grid h-8 w-8 place-items-center rounded-full border border-[#d0d7de] bg-white text-[#59636e] hover:border-[#0969da] hover:bg-[#ddf4ff] hover:text-[#0969da] disabled:opacity-60"
                      disabled={commentBusyId === comment.id}
                      title="Add reaction"
                      type="button"
                      onClick={() => {
                        setEmojiPickerCommentId(emojiPickerCommentId === comment.id ? null : comment.id);
                        setEmojiSearch("");
                      }}
                    >
                      <SmilePlus aria-hidden="true" size={16} />
                    </button>
                    {emojiPickerCommentId === comment.id ? (
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
                            const existing = comment.reactions.find((reaction) => reaction.emoji === option.emoji);
                            return (
                              <button
                                className={`grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-[#f6f8fa] ${
                                  existing?.viewer_reacted ? "bg-[#ddf4ff] ring-1 ring-[#0969da]" : ""
                                }`}
                                key={option.emoji}
                                title={option.label}
                                type="button"
                                onClick={() =>
                                  void toggleReaction(comment, {
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
                  <div className="relative flex flex-wrap justify-end gap-2">
                    {comment.viewer_can_update ? (
                      <>
                        <button
                          className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[#f6f8fa]"
                          type="button"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditBody(comment.body);
                            setEditAttachments(comment.attachments);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 text-sm font-semibold text-[#cf222e] hover:bg-[#fff8f8]"
                          type="button"
                          onClick={() => setPendingDelete(comment)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          </div>
        ))
      )}

      <MarkdownEditor
        attachments={newAttachments}
        label="Add a comment"
        submitLabel="Comment"
        uploadUrl={attachmentUploadUrl}
        value={newBody}
        onAttachmentsChange={setNewAttachments}
        onChange={setNewBody}
        onSubmit={addComment}
      />

      <Drawer isOpen={pendingDelete !== null} title="Delete comment" onClose={() => setPendingDelete(null)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">Delete this comment? The message body, attachments, and reactions will be removed, but the conversation order will be preserved.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button
              className="rounded-md border border-[#cf222e] bg-[#cf222e] px-3 py-1.5 font-semibold text-white disabled:opacity-60"
              disabled={pendingDelete ? commentBusyId === pendingDelete.id : false}
              type="button"
              onClick={() => void deleteComment()}
            >
              {pendingDelete && commentBusyId === pendingDelete.id ? "Deleting..." : "Delete comment"}
            </button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}

function emojiOptionsForSearch(search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return EMOJI_OPTIONS;
  }
  return EMOJI_OPTIONS.filter((option) =>
    [option.emoji, option.label, option.keywords].join(" ").toLowerCase().includes(normalized),
  );
}

function AttachmentList({ attachments }: { attachments: CommentAttachment[] }) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <a className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1 text-sm font-semibold text-[#0969da] hover:underline" href={attachment.url} key={attachment.id}>
          {attachment.filename}
        </a>
      ))}
    </div>
  );
}

function Avatar({ comment }: { comment: IssueComment }) {
  const label = comment.author_display_name || comment.author_handle;
  if (comment.author_avatar_url) {
    // Federated avatars can come from arbitrary hosts, which Next Image cannot preconfigure.
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" className="h-10 w-10 rounded-full border border-[#d0d7de] object-cover" src={comment.author_avatar_url} />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d0d7de] bg-[#f6f8fa] text-sm font-bold text-[#59636e]">
      {avatarFallback(label)}
    </span>
  );
}

function AuthorLink({ comment }: { comment: IssueComment }) {
  const label = comment.author_display_name || comment.author_handle;
  if (!comment.author_actor_url) {
    return <span className="font-semibold text-[#24292f]">{label}</span>;
  }
  return (
    <a className="font-semibold text-[#0969da] hover:underline" href={comment.author_actor_url} rel="noreferrer" target="_blank">
      {label}
    </a>
  );
}

function avatarFallback(label: string) {
  return label
    .split(/[\s@/.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
