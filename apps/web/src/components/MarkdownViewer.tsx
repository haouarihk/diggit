import type { ElementType, ReactNode } from "react";

type MarkdownViewerProps = {
  content: string;
  fileName?: string;
  className?: string;
  sanitizedHtml?: string;
  variant?: "file" | "comment";
};

type MarkdownBlock =
  | { type: "blockquote"; text: string }
  | { type: "code"; code: string; language: string }
  | { type: "heading"; level: number; text: string }
  | { type: "horizontalRule" }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export function MarkdownViewer({ content, fileName, className = "", sanitizedHtml, variant = "file" }: MarkdownViewerProps) {
  const blocks = parseMarkdown(sanitizeMarkdownContent(content));
  const shell = variant === "comment" ? `grid gap-3 ${className}` : `rounded-b-md border border-t-0 border-[#d0d7de] bg-white p-5 ${className}`;
  const emptyLabel = variant === "comment" ? "Nothing to preview yet." : "This file is empty.";

  return (
    <article className={shell}>
      {fileName ? (
        <div className="mb-5 flex items-center gap-2 border-b border-[#d8dee4] pb-3 text-sm text-[#59636e]">
          {fileIcon(fileName)}
          <span className="font-semibold text-[#1f2328]">{fileName}</span>
        </div>
      ) : null}

      {sanitizedHtml ? (
        <div
          className="grid gap-3 text-[#1f2328] [&_a]:font-medium [&_a]:text-[#0969da] [&_a]:hover:underline [&_blockquote]:border-l-4 [&_blockquote]:border-[#d0d7de] [&_blockquote]:pl-4 [&_blockquote]:text-[#59636e] [&_code]:rounded [&_code]:bg-[#f6f8fa] [&_code]:px-1.5 [&_code]:py-0.5 [&_img]:max-h-[420px] [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-[#d0d7de] [&_li]:ml-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[#0d1117] [&_pre]:p-4 [&_pre]:text-[#e6edf3] [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      ) : blocks.length === 0 ? (
        <p className="text-[#59636e]">{emptyLabel}</p>
      ) : (
        <div className={`${variant === "comment" ? "grid gap-3" : "grid gap-4"} text-[#1f2328]`}>
          {blocks.map((block, index) => renderBlock(block, index, variant))}
        </div>
      )}
    </article>
  );
}

export function sanitizeMarkdownContent(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sanitized: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      sanitized.push(line);
      inFence = !inFence;
      continue;
    }

    sanitized.push(inFence ? line : sanitizeMarkdownLine(line));
  }

  return sanitized.join("\n");
}

function sanitizeMarkdownLine(line: string) {
  return line
    .replace(/<!--.*?-->/g, "")
    .replace(/<\/?(script|style|iframe|object|embed|svg|math)[^>]*>/gi, "")
    .replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?>/g, "");
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

function renderBlock(block: MarkdownBlock, index: number, variant: MarkdownViewerProps["variant"]) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as ElementType;
      const size =
        variant === "comment"
          ? block.level === 1
            ? "text-xl"
            : "text-lg"
          : block.level === 1
            ? "text-2xl"
            : block.level === 2
              ? "text-xl"
              : "text-lg";
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
        <div className="overflow-hidden rounded-md border border-[#d0d7de] bg-[#0d1117] text-[#e6edf3]" key={index}>
          <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#8b949e]">
            <span>{block.language || "code"}</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-6">
            <code>{highlightCode(block.code, block.language)}</code>
          </pre>
        </div>
      );
    case "horizontalRule":
      return <hr className="border-[#d8dee4]" key={index} />;
  }
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|!?\[[^\]]+\]\([^)]+\))/g;
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
    } else if (token.startsWith("![")) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const src = safeMarkdownHref(image?.[2] ?? "");
      nodes.push(
        <span className="my-2 block" key={`${token}-${match.index}`}>
          {/* Comment and federated images are arbitrary URLs, so Next Image cannot preconfigure them. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={image?.[1] ?? ""} className="max-h-[420px] max-w-full rounded-md border border-[#d0d7de]" src={src} />
        </span>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = safeMarkdownHref(link?.[2] ?? "");
      nodes.push(
        <a className="font-medium text-[#0969da] hover:underline" href={href} key={`${token}-${match.index}`}>
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

function highlightCode(code: string, language: string) {
  const normalized = language.toLowerCase();
  if (normalized === "json") {
    return highlightJson(code);
  }
  if (["js", "jsx", "javascript", "ts", "tsx", "typescript"].includes(normalized)) {
    return highlightKeywords(code, /\b(await|async|break|case|catch|class|const|continue|default|else|export|extends|finally|for|from|function|if|import|let|new|return|switch|throw|try|type|var|while)\b/g);
  }
  if (["rs", "rust"].includes(normalized)) {
    return highlightKeywords(code, /\b(async|await|break|const|continue|crate|else|enum|fn|for|if|impl|let|match|mod|mut|pub|return|self|struct|trait|use|where|while)\b/g);
  }
  if (["py", "python"].includes(normalized)) {
    return highlightKeywords(code, /\b(and|as|async|await|break|class|continue|def|elif|else|except|False|for|from|if|import|in|is|lambda|None|not|or|pass|return|True|try|while|with|yield)\b/g);
  }
  if (["sh", "bash", "shell"].includes(normalized)) {
    return highlightKeywords(code, /\b(case|do|done|elif|else|esac|fi|for|function|if|in|then|while)\b/g);
  }
  return code;
}

function highlightKeywords(code: string, keywordPattern: RegExp) {
  const keywordMatcher = new RegExp(keywordPattern.source);
  return code.split(/(".*?"|'.*?'|`.*?`|\/\/.*|#.*)/g).map((part, index) => {
    if (!part) {
      return null;
    }
    if (/^(["'`])/.test(part)) {
      return <span className="text-[#a5d6ff]" key={index}>{part}</span>;
    }
    if (/^(\/\/|#)/.test(part)) {
      return <span className="text-[#8b949e]" key={index}>{part}</span>;
    }
    return part.split(keywordPattern).map((token, tokenIndex) =>
      keywordMatcher.test(token) ? (
        <span className="text-[#ff7b72]" key={`${index}-${tokenIndex}`}>{token}</span>
      ) : (
        token
      ),
    );
  });
}

function highlightJson(code: string) {
  return code.split(/("(?:\\.|[^"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?)/g).map((part, index) => {
    if (/^"/.test(part)) {
      return <span className="text-[#a5d6ff]" key={index}>{part}</span>;
    }
    if (/^(true|false|null)$/.test(part)) {
      return <span className="text-[#ff7b72]" key={index}>{part}</span>;
    }
    if (/^-?\d/.test(part)) {
      return <span className="text-[#79c0ff]" key={index}>{part}</span>;
    }
    return part;
  });
}

export function safeMarkdownHref(href: string) {
  const trimmed = href.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed || "#";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" ? trimmed : "#";
  } catch {
    return "#";
  }
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
