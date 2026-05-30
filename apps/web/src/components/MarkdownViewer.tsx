import type { ElementType, ReactNode } from "react";

type MarkdownViewerProps = {
  content: string;
  fileName?: string;
  className?: string;
};

type MarkdownBlock =
  | { type: "blockquote"; text: string }
  | { type: "code"; code: string; language: string }
  | { type: "heading"; level: number; text: string }
  | { type: "horizontalRule" }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export function MarkdownViewer({ content, fileName, className = "" }: MarkdownViewerProps) {
  const blocks = parseMarkdown(content);

  return (
    <article className={`rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5 ${className}`}>
      {fileName ? (
        <div className="mb-5 flex items-center gap-2 border-b border-[#d8dee4] pb-3 text-sm text-[#59636e]">
          {fileIcon(fileName)}
          <span className="font-semibold text-[#1f2328]">{fileName}</span>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <p className="text-[#59636e]">This file is empty.</p>
      ) : (
        <div className="grid gap-4 text-[#1f2328]">{blocks.map(renderBlock)}</div>
      )}
    </article>
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", language, code: code.join("\n") });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quote.join(" ") });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && shouldContinueParagraph(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function shouldContinueParagraph(line: string) {
  const trimmed = line.trim();
  return (
    Boolean(trimmed) &&
    !trimmed.startsWith("```") &&
    !trimmed.startsWith(">") &&
    !/^(#{1,6})\s+/.test(trimmed) &&
    !/^[-*]\s+/.test(trimmed) &&
    !/^(-{3,}|\*{3,})$/.test(trimmed)
  );
}

function renderBlock(block: MarkdownBlock, index: number) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as ElementType;
      const size = block.level === 1 ? "text-2xl" : block.level === 2 ? "text-xl" : "text-lg";
      return (
        <Tag className={`${size} border-b border-[#d8dee4] pb-2 font-semibold tracking-tight`} key={index}>
          {renderInline(block.text)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="max-w-none text-[15px] leading-7 text-[#1f2328]" key={index}>
          {renderInline(block.text)}
        </p>
      );
    case "list":
      return (
        <ul className="ml-5 list-disc space-y-1 text-[15px] leading-7" key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-4 border-[#d0d7de] pl-4 text-[15px] leading-7 text-[#59636e]" key={index}>
          {renderInline(block.text)}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-[#f6f8fa] p-4 text-sm leading-6 text-[#1f2328]" key={index}>
          {block.language ? <div className="mb-2 text-xs font-semibold text-[#59636e]">{block.language}</div> : null}
          <code>{block.code}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr className="border-[#d8dee4]" key={index} />;
  }
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code className="rounded bg-[#f6f8fa] px-1.5 py-0.5 text-[0.9em]" key={`${token}-${match.index}`}>
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        <a className="font-medium text-[#0969da] hover:underline" href={link?.[2] ?? "#"} key={`${token}-${match.index}`}>
          {link?.[1] ?? token}
        </a>,
      );
    }

    cursor = match.index + token.length;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function fileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "md" || extension === "mdx") {
    return <span className="rounded border border-[#d0d7de] px-1.5 py-0.5 text-xs font-bold text-[#0969da]">MD</span>;
  }
  if (extension === "json" || extension === "yml" || extension === "yaml") {
    return <span className="rounded border border-[#d0d7de] px-1.5 py-0.5 text-xs font-bold text-[#8250df]">CFG</span>;
  }
  if (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "svg") {
    return <span className="rounded border border-[#d0d7de] px-1.5 py-0.5 text-xs font-bold text-[#1a7f37]">IMG</span>;
  }
  return <span className="rounded border border-[#d0d7de] px-1.5 py-0.5 text-xs font-bold text-[#59636e]">FILE</span>;
}
