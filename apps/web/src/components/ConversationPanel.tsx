"use client";

import { Drawer } from "@/components/Drawer";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { ReactionControls } from "@/components/ReactionControls";
import { authHeaders } from "@/lib/auth-session";
import type { ActivityItem, CommentAttachment, CommentReaction, IssueComment, TimelineEvent } from "@/lib/api";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ConversationPanelProps = {
  activity: ActivityItem[];
  activityUrl: string;
  attachmentUploadUrl: string;
  commentsUrl: string;
  emptyLabel?: string;
  title?: string;
};

export function ConversationPanel({
  activity: initialActivity,
  activityUrl,
  attachmentUploadUrl,
  commentsUrl,
  emptyLabel = "No activity yet.",
  title = "Activity",
}: ConversationPanelProps) {
  const router = useRouter();
  const [activity, setActivity] = useState(initialActivity);
  const [message, setMessage] = useState("");
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editAttachments, setEditAttachments] = useState<CommentAttachment[]>([]);
  const [newBody, setNewBody] = useState("");
  const [newAttachments, setNewAttachments] = useState<CommentAttachment[]>([]);
  const [pendingDelete, setPendingDelete] = useState<IssueComment | null>(null);

  async function refreshActivity() {
    const response = await fetch(`${activityUrl}?limit=100`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to refresh activity: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: ActivityItem[] };
    setActivity(body.data);
  }

  function updateCommentInActivity(updated: IssueComment) {
    setActivity((current) =>
      current.map((item) =>
        item.kind === "comment" && item.comment.id === updated.id
          ? { ...item, comment: updated, created_at: updated.created_at }
          : item,
      ),
    );
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
    await refreshActivity();
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
    updateCommentInActivity(updated);
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
    updateCommentInActivity(updated);
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
    updateCommentInActivity(updated);
  }

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{title}</h2>
      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}
      {activity.length === 0 ? (
        <p className="rounded-xl border border-[#d0d7de] bg-white p-4 text-[#59636e]">{emptyLabel}</p>
      ) : (
        activity.map((item) => {
          if (item.kind === "event") {
            return <EventActivityItem event={item.event} key={`event-${item.event.id}`} />;
          }
          const comment = item.comment;
          return (
          <div className="flex items-start gap-3" key={`comment-${comment.id}`}>
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
                <ReactionControls
                  disabled={commentBusyId === comment.id}
                  reactions={comment.reactions}
                  onToggle={(reaction) => void toggleReaction(comment, reaction)}
                />
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
          );
        })
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
          <p className="text-[#59636e]">Delete this comment? The message body, attachments, and reactions will be removed, but the activity order will be preserved.</p>
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

function EventActivityItem({ event }: { event: TimelineEvent }) {
  const label = event.actor_display_name || event.actor_handle;
  return (
    <div className="flex items-start gap-3">
      <EventAvatar event={event} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-xl border border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 text-sm text-[#59636e]">
        <span className="font-semibold text-[#1f2328]">{label}</span>
        <span>{event.body || eventLabel(event.event_type)}</span>
        <span>{formatDate(event.created_at)}</span>
        {event.remote_server ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#59636e]">{event.remote_server}</span> : null}
      </div>
    </div>
  );
}

function EventAvatar({ event }: { event: TimelineEvent }) {
  const label = event.actor_display_name || event.actor_handle;
  if (event.actor_avatar_url) {
    // Federated avatars can come from arbitrary hosts, which Next Image cannot preconfigure.
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" className="h-8 w-8 rounded-full border border-[#d0d7de] object-cover" src={event.actor_avatar_url} />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d0d7de] bg-white text-xs font-bold text-[#59636e]">
      {avatarFallback(label)}
    </span>
  );
}

function eventLabel(eventType: string) {
  switch (eventType) {
    case "opened":
      return "opened this item";
    case "closed":
      return "closed this item";
    case "reopened":
      return "reopened this item";
    case "merged":
      return "merged this pull request";
    case "renamed":
      return "renamed this item";
    case "mentioned":
      return "mentioned someone";
    default:
      return eventType.split("_").join(" ");
  }
}

function Avatar({ comment }: { comment: IssueComment }) {
  const label = comment.author_display_name || comment.author_handle;
  if (comment.author_avatar_url) {
    // Federated avatars can come from arbitrary hosts, which Next Image cannot preconfigure.
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" className="mt-4 h-10 w-10 rounded-full border border-[#d0d7de] object-cover" src={comment.author_avatar_url} />;
  }
  return (
    <span className="mt-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d0d7de] bg-[#f6f8fa] text-sm font-bold text-[#59636e]">
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
