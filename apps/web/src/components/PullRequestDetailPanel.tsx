"use client";

import { Drawer } from "@/components/Drawer";
import { authHeaders } from "@/lib/auth-session";
import type { CommentReaction, PullRequest, PullRequestComment } from "@/lib/api";
import { apiBaseUrl } from "@/lib/runtime-config";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_URL = apiBaseUrl();
const COMMENT_REACTIONS = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"];

type PullRequestDetailPanelProps = {
  baseHref: string;
  comments: PullRequestComment[];
  name: string;
  owner: string;
  pullRequest: PullRequest;
};

export function PullRequestDetailPanel({
  baseHref,
  comments: initialComments,
  name,
  owner,
  pullRequest: initialPullRequest,
}: PullRequestDetailPanelProps) {
  const router = useRouter();
  const [pullRequest, setPullRequest] = useState(initialPullRequest);
  const [comments, setComments] = useState(initialComments);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PullRequestComment | null>(null);

  const commentsUrl = `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(pullRequest.id)}/comments`;

  async function updateStatus(status: "open" | "closed") {
    setIsBusy(true);
    setMessage("");
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(pullRequest.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      },
    );
    setIsBusy(false);

    if (!response.ok) {
      setMessage(`Failed to update pull request: ${response.status}`);
      return;
    }

    setPullRequest((await response.json()) as PullRequest);
    setMessage(status === "closed" ? "Pull request closed." : "Pull request reopened.");
    router.refresh();
  }

  async function mergePullRequest() {
    setIsBusy(true);
    setMessage("");
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull-requests/${encodeURIComponent(pullRequest.id)}/merge`,
      {
        method: "POST",
        headers: authHeaders(),
      },
    );
    setIsBusy(false);

    if (!response.ok) {
      setMessage(`Merge failed: ${response.status}`);
      return;
    }

    setPullRequest((await response.json()) as PullRequest);
    setMessage("Pull request merged.");
    router.refresh();
  }

  async function refreshComments() {
    const response = await fetch(`${commentsUrl}?limit=100`, { headers: authHeaders() });
    if (!response.ok) {
      setMessage(`Failed to refresh comments: ${response.status}`);
      return;
    }
    const body = (await response.json()) as { data: PullRequestComment[] };
    setComments(body.data);
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ body: form.get("body") }),
    });
    if (!response.ok) {
      setMessage(`Failed to comment: ${response.status}`);
      return;
    }
    formElement.reset();
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
      body: JSON.stringify({ body: editBody }),
    });
    setCommentBusyId(null);
    if (!response.ok) {
      setMessage(`Failed to edit comment: ${response.status}`);
      return;
    }
    const updated = (await response.json()) as PullRequestComment;
    setComments((current) => current.map((comment) => (comment.id === updated.id ? updated : comment)));
    setEditingCommentId(null);
    setEditBody("");
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
    const updated = (await response.json()) as PullRequestComment;
    setComments((current) => current.map((comment) => (comment.id === updated.id ? updated : comment)));
    setPendingDelete(null);
    setMessage("Comment deleted.");
    router.refresh();
  }

  async function toggleReaction(comment: PullRequestComment, reaction: CommentReaction) {
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
    const updated = (await response.json()) as PullRequestComment;
    setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  return (
    <main className="grid gap-5">
      <a className="text-sm font-semibold text-[#0969da] hover:underline" href={`${baseHref}/pull-requests`}>
        Back to pull requests
      </a>

      <section className="grid gap-4 rounded-2xl border border-[#d0d7de] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <PullRequestStatus status={pullRequest.status} />
              <span className="text-sm text-[#59636e]">Opened {formatDate(pullRequest.created_at)}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{pullRequest.title}</h1>
            <p className="text-sm text-[#59636e]">
              {pullRequest.author_handle} wants to merge{" "}
              <BranchBadge>{pullRequest.source_branch}</BranchBadge> into{" "}
              <BranchBadge>{pullRequest.target_branch}</BranchBadge>
            </p>
          </div>

          {pullRequest.viewer_can_update ? (
            <div className="flex flex-wrap gap-2">
              {pullRequest.status === "open" ? (
                <>
                  <button
                    className="rounded-lg border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white disabled:opacity-60"
                    disabled={isBusy}
                    type="button"
                    onClick={() => void mergePullRequest()}
                  >
                    {isBusy ? "Working..." : "Merge pull request"}
                  </button>
                  <button
                    className="rounded-lg border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold text-[#cf222e] disabled:opacity-60"
                    disabled={isBusy}
                    type="button"
                    onClick={() => void updateStatus("closed")}
                  >
                    Close
                  </button>
                </>
              ) : null}
              {pullRequest.status === "closed" ? (
                <button
                  className="rounded-lg border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold disabled:opacity-60"
                  disabled={isBusy}
                  type="button"
                  onClick={() => void updateStatus("open")}
                >
                  Reopen
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-[#d8dee4] bg-[#f6f8fa] p-4">
          {pullRequest.body ? <p className="whitespace-pre-wrap">{pullRequest.body}</p> : <p className="text-[#59636e]">No description provided.</p>}
        </div>
      </section>

      {message ? <p className="text-sm text-[#59636e]">{message}</p> : null}

      <section className="grid gap-3">
        <h2 className="font-semibold">Conversation</h2>
        {comments.length === 0 ? (
          <p className="rounded-xl border border-[#d0d7de] bg-white p-4 text-[#59636e]">No comments yet.</p>
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
                    <form className="mt-3 grid gap-3" onSubmit={(event) => void saveComment(event, comment.id)}>
                      <textarea
                        className="min-h-28 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2"
                        required
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold"
                          type="button"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditBody("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white disabled:opacity-60"
                          disabled={commentBusyId === comment.id}
                          type="submit"
                        >
                          {commentBusyId === comment.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap">{comment.body}</p>
                  )}
                </div>
              </div>

              {!comment.deleted_at ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
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
                    {comment.reactions.length === 0
                      ? COMMENT_REACTIONS.map((emoji) => (
                          <button
                            className="rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1 text-sm disabled:opacity-60"
                            disabled={commentBusyId === comment.id}
                            key={emoji}
                            type="button"
                            onClick={() => void toggleReaction(comment, { emoji, count: 0, viewer_reacted: false })}
                          >
                            {emoji}
                          </button>
                        ))
                      : null}
                  </div>
                  {comment.viewer_can_update ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold"
                        type="button"
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditBody(comment.body);
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
      </section>

      <form className="grid gap-3 rounded-xl border border-[#d0d7de] bg-[#f6f8fa] p-4" onSubmit={addComment}>
        <label className="grid gap-1.5">
          Add a comment
          <textarea className="min-h-28 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2" name="body" required />
        </label>
        <button className="justify-self-end rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white" type="submit">
          Comment
        </button>
      </form>

      <Drawer isOpen={pendingDelete !== null} title="Delete comment" onClose={() => setPendingDelete(null)}>
        <div className="grid gap-4">
          <p className="text-[#59636e]">Delete this comment? The message body and reactions will be removed, but the conversation order will be preserved.</p>
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
    </main>
  );
}

function PullRequestStatus({ status }: { status: PullRequest["status"] }) {
  const tone = status === "merged" ? "bg-[#8250df] text-white" : status === "closed" ? "bg-[#cf222e] text-white" : "bg-[#1a7f37] text-white";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function BranchBadge({ children }: { children: string }) {
  return <span className="rounded-md bg-[#ddf4ff] px-1.5 py-0.5 font-mono text-xs text-[#0969da]">{children}</span>;
}

function Avatar({ comment }: { comment: PullRequestComment }) {
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

function AuthorLink({ comment }: { comment: PullRequestComment }) {
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
