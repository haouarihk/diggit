import {
  $,
  component$,
  isBrowser,
  type PropFunction,
  useSignal,
} from "@builder.io/qwik";

import { getAuthToken } from "~/lib/auth-session";
import type { CommentAttachment } from "~/lib/api";
import { MarkdownViewer } from "~/components/markdown/MarkdownViewer";

type MarkdownEditorProps = {
  attachments: CommentAttachment[];
  disabled?: boolean;
  label: string;
  onAttachmentsChange$: PropFunction<(attachments: CommentAttachment[]) => void>;
  onCancel$?: PropFunction<() => void>;
  onChange$: PropFunction<(value: string) => void>;
  onSubmit$: PropFunction<() => void>;
  submitLabel: string;
  uploadUrl: string;
  value: string;
};

export const MarkdownEditor = component$(
  ({
    attachments,
    disabled = false,
    label,
    onAttachmentsChange$,
    onCancel$,
    onChange$,
    onSubmit$,
    submitLabel,
    uploadUrl,
    value,
  }: MarkdownEditorProps) => {
    const inputRef = useSignal<HTMLInputElement>();
    const textareaRef = useSignal<HTMLTextAreaElement>();
    const mode = useSignal<"preview" | "write">("write");
    const uploadMessage = useSignal("");
    const isDragging = useSignal(false);
    const isUploading = useSignal(false);

    const insertText = $(async (snippet: string) => {
      const textarea = textareaRef.value;
      if (!textarea) {
        await onChange$(`${value}${snippet}`);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextValue = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
      await onChange$(nextValue);

      if (!isBrowser) {
        return;
      }

      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.selectionStart = start + snippet.length;
        textarea.selectionEnd = start + snippet.length;
      });
    });

    const wrapSelection = $(async (prefix: string, suffix = prefix) => {
      const textarea = textareaRef.value;
      const start = textarea?.selectionStart ?? value.length;
      const end = textarea?.selectionEnd ?? value.length;
      const selected = value.slice(start, end);
      const replacement = `${prefix}${selected || "text"}${suffix}`;
      await onChange$(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
    });

    const uploadFiles = $(async (files: FileList | File[]) => {
      const token = getAuthToken();
      if (!token) {
        uploadMessage.value = "Sign in to upload attachments.";
        return;
      }

      const fileList = Array.from(files);
      if (fileList.length === 0) {
        return;
      }

      isUploading.value = true;
      uploadMessage.value = "";
      const uploaded: CommentAttachment[] = [];

      for (const file of fileList) {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        });
        if (!response.ok) {
          uploadMessage.value = `Failed to upload ${file.name}: ${response.status}`;
          continue;
        }
        const attachment = (await response.json()) as CommentAttachment;
        uploaded.push(attachment);
        await insertText(`${attachment.markdown}\n`);
      }

      if (uploaded.length > 0) {
        await onAttachmentsChange$([...attachments, ...uploaded]);
      }
      isUploading.value = false;
    });

    return (
      <form
        class={[
          "markdown-editor",
          isDragging.value ? "markdown-editor--dragging" : "",
        ]}
        onDragLeave$={() => {
          isDragging.value = false;
        }}
        onDragOver$={(event) => {
          event.preventDefault();
          isDragging.value = true;
        }}
        onDrop$={async (event) => {
          event.preventDefault();
          isDragging.value = false;
          if (event.dataTransfer?.files.length) {
            await uploadFiles(event.dataTransfer.files);
          }
        }}
        onSubmit$={async () => {
          await onSubmit$();
        }}
        preventdefault:submit
      >
        <div class="markdown-editor__header">
          <div>
            <span class="markdown-editor__title">{label}</span>
            <p class="markdown-editor__subtitle">
              Markdown, files, paste and drag-drop supported.
            </p>
          </div>
          <div class="markdown-editor__tabs">
            <button
              class={[
                "markdown-editor__tab",
                mode.value === "write" ? "markdown-editor__tab--active" : "",
              ]}
              type="button"
              onClick$={() => {
                mode.value = "write";
              }}
            >
              Write
            </button>
            <button
              class={[
                "markdown-editor__tab",
                mode.value === "preview" ? "markdown-editor__tab--active" : "",
              ]}
              type="button"
              onClick$={() => {
                mode.value = "preview";
              }}
            >
              Preview
            </button>
          </div>
        </div>

        {mode.value === "write" ? (
          <div class="markdown-editor__write">
            <div class="markdown-editor__toolbar">
              <ToolbarButton
                label="Link"
                onClick$={$(() => wrapSelection("[", "](https://example.com)"))}
              />
              <ToolbarButton
                label="Image"
                onClick$={$(() =>
                  insertText("![alt text](https://example.com/image.png)")
                )}
              />
              <ToolbarButton
                label="Code"
                onClick$={$(() => insertText("```js\n\n```\n"))}
              />
              <ToolbarButton
                label="Quote"
                onClick$={$(() => insertText("> "))}
              />
              <ToolbarButton
                label="List"
                onClick$={$(() => insertText("- "))}
              />
              <ToolbarButton
                label={isUploading.value ? "Uploading..." : "Attach"}
                onClick$={$(() => {
                  inputRef.value?.click();
                })}
              />
            </div>

            <textarea
              ref={textareaRef}
              class="markdown-editor__textarea"
              disabled={disabled}
              placeholder="Leave a comment. Use ```js for code blocks, paste images, or drop files here."
              required
              value={value}
              onInput$={async (_, currentTarget) => {
                await onChange$(currentTarget.value);
              }}
              onPaste$={async (event) => {
                if (event.clipboardData?.files.length) {
                  event.preventDefault();
                  await uploadFiles(event.clipboardData.files);
                }
              }}
            />

            <input
              ref={inputRef}
              class="sr-only"
              multiple
              type="file"
              onChange$={async (_, currentTarget) => {
                if (currentTarget.files) {
                  await uploadFiles(currentTarget.files);
                  currentTarget.value = "";
                }
              }}
            />
          </div>
        ) : (
          <div class="markdown-editor__preview">
            <MarkdownViewer content={value} variant="comment" />
          </div>
        )}

        <div class="markdown-editor__footer">
          {attachments.length > 0 ? (
            <div class="markdown-editor__attachments">
              {attachments.map((attachment) => (
                <span class="markdown-editor__attachment" key={attachment.id}>
                  {attachment.isImage ? "Image" : "File"}: {attachment.filename}
                </span>
              ))}
            </div>
          ) : null}
          {uploadMessage.value ? (
            <p class="markdown-editor__message">{uploadMessage.value}</p>
          ) : null}
          <div class="markdown-editor__footer-row">
            <p class="markdown-editor__hint">
              {isDragging.value
                ? "Drop files to upload."
                : "Tip: paste screenshots directly into the editor."}
            </p>
            <div class="markdown-editor__actions">
              {onCancel$ ? (
                <button
                  class="settings-resource-panel__secondary-button"
                  type="button"
                  onClick$={onCancel$}
                >
                  Cancel
                </button>
              ) : null}
              <button
                class="settings-resource-panel__primary-button"
                disabled={disabled || isUploading.value}
                type="submit"
              >
                {isUploading.value ? "Uploading..." : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </form>
    );
  },
);

const ToolbarButton = component$(
  ({
    label,
    onClick$,
  }: {
    label: string;
    onClick$: PropFunction<() => void>;
  }) => {
    return (
      <button class="markdown-editor__toolbar-button" type="button" onClick$={onClick$}>
        {label}
      </button>
    );
  },
);
