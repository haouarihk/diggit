"use client";

import { authHeaders } from "@/lib/auth-session";
import type { CommentAttachment } from "@/lib/api";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, useRef, useState } from "react";

type MarkdownEditorProps = {
  attachments: CommentAttachment[];
  label: string;
  submitLabel: string;
  uploadUrl: string;
  value: string;
  disabled?: boolean;
  onAttachmentsChange: (attachments: CommentAttachment[]) => void;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function MarkdownEditor({
  attachments,
  disabled = false,
  label,
  onAttachmentsChange,
  onCancel,
  onChange,
  onSubmit,
  submitLabel,
  uploadUrl,
  value,
}: MarkdownEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    const fileList = Array.from(files);
    if (fileList.length === 0) {
      return;
    }
    setIsUploading(true);
    setUploadMessage("");
    const uploaded: CommentAttachment[] = [];
    for (const file of fileList) {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!response.ok) {
        setUploadMessage(`Failed to upload ${file.name}: ${response.status}`);
        continue;
      }
      const attachment = (await response.json()) as CommentAttachment;
      uploaded.push(attachment);
      insertText(`${attachment.markdown}\n`);
    }
    if (uploaded.length > 0) {
      onAttachmentsChange([...attachments, ...uploaded]);
    }
    setIsUploading(false);
  }

  function insertText(snippet: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${snippet}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = start + snippet.length;
      textarea.selectionEnd = start + snippet.length;
    });
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const replacement = `${prefix}${selected || "text"}${suffix}`;
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) {
      void uploadFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData.files;
    if (files.length > 0) {
      event.preventDefault();
      void uploadFiles(files);
    }
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      void uploadFiles(event.dataTransfer.files);
    }
  }

  return (
    <form
      className={`grid gap-3 rounded-xl border border-[#d0d7de] bg-[#f6f8fa] p-4 ${isDragging ? "ring-2 ring-[#0969da]" : ""}`}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDrop={handleDrop}
      onSubmit={onSubmit}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <div className="flex rounded-md border border-[#d0d7de] bg-white p-0.5 text-sm">
          <button className={tabClass(mode === "write")} type="button" onClick={() => setMode("write")}>
            Write
          </button>
          <button className={tabClass(mode === "preview")} type="button" onClick={() => setMode("preview")}>
            Preview
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <>
          <div className="flex flex-wrap gap-1.5 rounded-t-md border border-b-0 border-[#d0d7de] bg-white px-2 py-1.5 text-sm">
            <ToolbarButton label="Link" onClick={() => wrapSelection("[", "](https://example.com)")} />
            <ToolbarButton label="Image" onClick={() => insertText("![alt text](https://example.com/image.png)")} />
            <ToolbarButton label="Code" onClick={() => insertText("```js\n\n```\n")} />
            <ToolbarButton label="Quote" onClick={() => insertText("> ")} />
            <ToolbarButton label="List" onClick={() => insertText("- ")} />
            <ToolbarButton label={isUploading ? "Uploading..." : "Attach"} onClick={() => inputRef.current?.click()} />
          </div>
          <textarea
            className="min-h-36 w-full rounded-b-md border border-[#d0d7de] bg-white px-3 py-2 text-[#1f2328]"
            disabled={disabled}
            ref={textareaRef}
            required
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onPaste={handlePaste}
          />
          <input className="hidden" multiple ref={inputRef} type="file" onChange={handleFileInput} />
        </>
      ) : (
        <div className="min-h-36 rounded-md border border-[#d0d7de] bg-white p-3">
          <MarkdownViewer content={value} variant="comment" />
        </div>
      )}

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <span className="rounded-full border border-[#d0d7de] bg-white px-3 py-1 text-sm text-[#59636e]" key={attachment.id}>
              {attachment.isImage ? "Image" : "File"}: {attachment.filename}
            </span>
          ))}
        </div>
      ) : null}
      {uploadMessage ? <p className="text-sm text-[#cf222e]">{uploadMessage}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <button className="rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white disabled:opacity-60" disabled={disabled || isUploading} type="submit">
          {isUploading ? "Uploading..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="rounded px-2 py-1 font-semibold text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#0969da]" type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function tabClass(active: boolean) {
  return `rounded px-2 py-1 font-semibold ${active ? "bg-[#0969da] text-white" : "text-[#59636e]"}`;
}
