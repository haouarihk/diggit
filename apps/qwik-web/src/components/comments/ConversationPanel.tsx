import { $, component$, useSignal } from "@builder.io/qwik";

import { ReactionControls } from "~/components/comments/ReactionControls";
import { MarkdownEditor } from "~/components/markdown/MarkdownEditor";
import { MarkdownViewer } from "~/components/markdown/MarkdownViewer";
import { Drawer } from "~/components/ui/Drawer";
import { getAuthToken } from "~/lib/auth-session";
import type {
  ActivityItem,
  CommentAttachment,
  CommentReaction,
  IssueComment,
  TimelineEvent,
} from "~/lib/api";

type ConversationPanelProps = {
  activity: ActivityItem[];
  activityUrl: string;
  attachmentUploadUrl: string;
  commentsUrl: string;
  emptyLabel?: string;
  title?: string;
};

export const ConversationPanel = component$(
  ({
    activity: initialActivity,
    activityUrl,
    attachmentUploadUrl,
    commentsUrl,
    emptyLabel = "No activity yet.",
    title = "Activity",
  }: ConversationPanelProps) => {
    const activity = useSignal(initialActivity);
    const message = useSignal("");
    const commentBusyId = useSignal<string | null>(null);
    const editingCommentId = useSignal<string | null>(null);
    const editBody = useSignal("");
    const editAttachments = useSignal<CommentAttachment[]>([]);
    const newBody = useSignal("");
    const newAttachments = useSignal<CommentAttachment[]>([]);
    const pendingDelete = useSignal<IssueComment | null>(null);

    const refreshActivity = $(async () => {
      const token = getAuthToken();
      const headers = token ? { authorization: `Bearer ${token}` } : undefined;
      const response = await fetch(`${activityUrl}?limit=100`, { headers });
      if (!response.ok) {
        message.value = `Failed to refresh activity: ${response.status}`;
        return;
      }
      const body = (await response.json()) as { data: ActivityItem[] };
      activity.value = body.data;
    });

    const updateCommentInActivity = $((updated: IssueComment) => {
      activity.value = activity.value.map((item) =>
        item.kind === "comment" && item.comment.id === updated.id
          ? { ...item, comment: updated, created_at: updated.created_at }
          : item,
      );
    });

    const addComment = $(async () => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to comment.";
        return;
      }

      const response = await fetch(commentsUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          attachment_ids: newAttachments.value.map((attachment) => attachment.id),
          body: newBody.value,
        }),
      });
      if (!response.ok) {
        message.value = `Failed to comment: ${response.status}`;
        return;
      }
      newBody.value = "";
      newAttachments.value = [];
      await refreshActivity();
      message.value = "Comment added.";
    });

    const saveComment = $(async (commentId: string) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to edit comments.";
        return;
      }

      commentBusyId.value = commentId;
      const response = await fetch(`${commentsUrl}/${encodeURIComponent(commentId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          attachment_ids: editAttachments.value.map((attachment) => attachment.id),
          body: editBody.value,
        }),
      });
      commentBusyId.value = null;
      if (!response.ok) {
        message.value = `Failed to edit comment: ${response.status}`;
        return;
      }
      const updated = (await response.json()) as IssueComment;
      await updateCommentInActivity(updated);
      editingCommentId.value = null;
      editBody.value = "";
      editAttachments.value = [];
      message.value = "Comment updated.";
    });

    const deleteComment = $(async () => {
      const token = getAuthToken();
      if (!token || !pendingDelete.value) {
        message.value = "Sign in to delete comments.";
        return;
      }

      commentBusyId.value = pendingDelete.value.id;
      const response = await fetch(
        `${commentsUrl}/${encodeURIComponent(pendingDelete.value.id)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        },
      );
      commentBusyId.value = null;
      if (!response.ok) {
        message.value = `Failed to delete comment: ${response.status}`;
        return;
      }
      const updated = (await response.json()) as IssueComment;
      await updateCommentInActivity(updated);
      pendingDelete.value = null;
      message.value = "Comment deleted.";
    });

    const toggleReaction = $(async (comment: IssueComment, reaction: CommentReaction) => {
      const token = getAuthToken();
      if (!token) {
        message.value = "Sign in to react.";
        return;
      }

      commentBusyId.value = comment.id;
      const response = await fetch(
        `${commentsUrl}/${encodeURIComponent(comment.id)}/reactions`,
        {
          method: reaction.viewer_reacted ? "DELETE" : "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ emoji: reaction.emoji }),
        },
      );
      commentBusyId.value = null;
      if (!response.ok) {
        message.value = `Failed to update reaction: ${response.status}`;
        return;
      }
      const updated = (await response.json()) as IssueComment;
      await updateCommentInActivity(updated);
    });

    return (
      <section class="conversation-panel">
        <h2 class="conversation-panel__title">{title}</h2>
        {message.value ? (
          <p class="conversation-panel__message">{message.value}</p>
        ) : null}

        {activity.value.length === 0 ? (
          <p class="conversation-panel__empty">{emptyLabel}</p>
        ) : (
          activity.value.map((item) => {
            if (item.kind === "event") {
              return (
                <EventActivityItem
                  event={item.event}
                  key={`event-${item.event.id}`}
                />
              );
            }

            const comment = item.comment;
            return (
              <div class="conversation-panel__item" key={`comment-${comment.id}`}>
                <Avatar comment={comment} />
                <article class="conversation-panel__comment">
                  <div class="conversation-panel__comment-main">
                    <div class="conversation-panel__comment-header">
                      <AuthorLink comment={comment} />
                      <span class="conversation-panel__comment-meta">
                        commented {formatDate(comment.created_at)}
                      </span>
                      {comment.remote_server ? (
                        <span class="conversation-panel__comment-pill">
                          {comment.remote_server}
                        </span>
                      ) : null}
                      {comment.updated_at !== comment.created_at &&
                      !comment.deleted_at ? (
                        <span class="conversation-panel__comment-meta">edited</span>
                      ) : null}
                    </div>

                    <div class="conversation-panel__comment-body">
                      {comment.deleted_at ? (
                        <p class="conversation-panel__deleted">
                          This comment was deleted.
                        </p>
                      ) : editingCommentId.value === comment.id ? (
                        <MarkdownEditor
                          attachments={editAttachments.value}
                          disabled={commentBusyId.value === comment.id}
                          label="Edit comment"
                          onAttachmentsChange$={$((attachments) => {
                            editAttachments.value = attachments;
                          })}
                          onCancel$={$(() => {
                            editingCommentId.value = null;
                            editBody.value = "";
                            editAttachments.value = [];
                          })}
                          onChange$={$((value) => {
                            editBody.value = value;
                          })}
                          onSubmit$={$(() => saveComment(comment.id))}
                          submitLabel={
                            commentBusyId.value === comment.id ? "Saving..." : "Save"
                          }
                          uploadUrl={attachmentUploadUrl}
                          value={editBody.value}
                        />
                      ) : (
                        <>
                          <MarkdownViewer
                            content={comment.body}
                            sanitizedHtml={comment.body_html}
                            variant="comment"
                          />
                          <AttachmentList attachments={comment.attachments} />
                        </>
                      )}
                    </div>
                  </div>

                  {!comment.deleted_at ? (
                    <div class="conversation-panel__comment-footer">
                      <ReactionControls
                        disabled={commentBusyId.value === comment.id}
                        onToggle$={$((reaction) => toggleReaction(comment, reaction))}
                        reactions={comment.reactions}
                      />
                      {comment.viewer_can_update ? (
                        <div class="conversation-panel__comment-actions">
                          <button
                            class="settings-resource-panel__secondary-button"
                            type="button"
                            onClick$={() => {
                              editingCommentId.value = comment.id;
                              editBody.value = comment.body;
                              editAttachments.value = comment.attachments;
                            }}
                          >
                            Edit
                          </button>
                          <button
                            class="conversation-panel__danger-button"
                            type="button"
                            onClick$={() => {
                              pendingDelete.value = comment;
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </div>
            );
          })
        )}

        <MarkdownEditor
          attachments={newAttachments.value}
          label="Add a comment"
          onAttachmentsChange$={$((attachments) => {
            newAttachments.value = attachments;
          })}
          onChange$={$((value) => {
            newBody.value = value;
          })}
          onSubmit$={addComment}
          submitLabel="Comment"
          uploadUrl={attachmentUploadUrl}
          value={newBody.value}
        />

        <Drawer
          isOpen={pendingDelete.value !== null}
          title="Delete comment"
          onClose$={$(() => {
            pendingDelete.value = null;
          })}
        >
          <div class="conversation-panel__delete-dialog">
            <p class="conversation-panel__delete-copy">
              Delete this comment? The message body, attachments, and reactions
              will be removed, but the activity order will be preserved.
            </p>
            <div class="conversation-panel__delete-actions">
              <button
                class="settings-resource-panel__secondary-button"
                type="button"
                onClick$={() => {
                  pendingDelete.value = null;
                }}
              >
                Cancel
              </button>
              <button
                class="conversation-panel__danger-button conversation-panel__danger-button--solid"
                disabled={
                  pendingDelete.value
                    ? commentBusyId.value === pendingDelete.value.id
                    : false
                }
                type="button"
                onClick$={deleteComment}
              >
                {pendingDelete.value &&
                commentBusyId.value === pendingDelete.value.id
                  ? "Deleting..."
                  : "Delete comment"}
              </button>
            </div>
          </div>
        </Drawer>
      </section>
    );
  },
);

const EventActivityItem = component$(({ event }: { event: TimelineEvent }) => {
  const label = event.actor_display_name || event.actor_handle;
  return (
    <div class="conversation-panel__item conversation-panel__item--event">
      <EventAvatar event={event} />
      <div class="conversation-panel__event">
        <span class="conversation-panel__event-actor">{label}</span>
        <span>{event.body || eventLabel(event.event_type)}</span>
        <span class="conversation-panel__comment-meta">{formatDate(event.created_at)}</span>
        {event.remote_server ? (
          <span class="conversation-panel__comment-pill">{event.remote_server}</span>
        ) : null}
      </div>
    </div>
  );
});

const AttachmentList = component$(
  ({ attachments }: { attachments: CommentAttachment[] }) => {
    if (attachments.length === 0) {
      return null;
    }

    return (
      <div class="conversation-panel__attachments">
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            class="conversation-panel__attachment"
            href={attachment.url}
            rel="noreferrer"
            target="_blank"
          >
            {attachment.filename}
          </a>
        ))}
      </div>
    );
  },
);

const Avatar = component$(({ comment }: { comment: IssueComment }) => {
  const fallback = avatarFallback(comment.author_display_name || comment.author_handle);

  return comment.author_avatar_url ? (
    <img
      alt=""
      class="conversation-panel__avatar"
      height={40}
      src={comment.author_avatar_url}
      width={40}
    />
  ) : (
    <span class="conversation-panel__avatar conversation-panel__avatar--fallback">
      {fallback}
    </span>
  );
});

const AuthorLink = component$(({ comment }: { comment: IssueComment }) => {
  const label = comment.author_display_name || comment.author_handle;
  return comment.author_actor_url ? (
    <a
      class="conversation-panel__author"
      href={comment.author_actor_url}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  ) : (
    <span class="conversation-panel__author">{label}</span>
  );
});

const EventAvatar = component$(({ event }: { event: TimelineEvent }) => {
  const label = event.actor_display_name || event.actor_handle;
  if (event.actor_avatar_url) {
    return (
      <img
        alt=""
        class="conversation-panel__event-avatar"
        height={32}
        src={event.actor_avatar_url}
        width={32}
      />
    );
  }
  return (
    <span class="conversation-panel__event-avatar conversation-panel__avatar--fallback">
      {avatarFallback(label)}
    </span>
  );
});

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
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
