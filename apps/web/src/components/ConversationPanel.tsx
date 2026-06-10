"use client";

import { Drawer } from "@/components/Drawer";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { authHeaders } from "@/lib/auth-session";
import type { CommentAttachment, CommentReaction, IssueComment } from "@/lib/api";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const COMMENT_REACTIONS = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"];

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
  }

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{title}</h2>
      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
      {comments.length === 0 ? (
        <p className="rounded-xl border border-[#d0d7de] bg-white p-4 text-[#59636e]">{emptyLabel}</p>
      ) : (
        comments.map((comment) => (
          <article className="grid gap-3 rounded-xl border border-[#d0d7de] bg-white p-4 shadow-sm" key={comment.id}>
            <div className="flex items-start gap-3">
              <Avatar comment={comment} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#59636e]">
                  <AuthorLink comment={comment} /> commented {formatDate(comment.created_at)}
                  {comment.remote_server ? <span> from {comment.remote_server}</span> : null}
                  {comment.updated_at !== comment.created_at && !comment.deleted_at ? <span> · edited</span> : null}
                </p>
                {comment.deleted_at ? (
                  <p className="mt-2 text-sm italic text-[#59636e]">This comment was deleted.</p>
                ) : editingCommentId === comment.id ? (
                  <div className="mt-3">
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
                  </div>
                ) : (
                  <div className="mt-2">
                    <MarkdownViewer content={comment.body} variant="comment" />
                    <AttachmentList attachments={comment.attachments} />
                  </div>
                )}
              </div>
            </div>

            {!comment.deleted_at ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {(comment.reactions.length > 0 ? comment.reactions : emptyReactions()).map((reaction) => (
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
                </div>
                {comment.viewer_can_update ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold"
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
                      className="rounded-md border border-[#cf222e] bg-white px-3 py-1.5 text-sm font-semibold text-[#cf222e]"
                      type="button"
                      onClick={() => setPendingDelete(comment)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
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

function emptyReactions(): CommentReaction[] {
  return COMMENT_REACTIONS.map((emoji) => ({ count: 0, emoji, viewer_reacted: false }));
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
