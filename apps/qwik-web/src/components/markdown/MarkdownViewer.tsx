import { component$, type JSXOutput } from "@builder.io/qwik";

type MarkdownViewerProps = {
  class?: string;
  content: string;
  fileName?: string;
  sanitizedHtml?: string;
  variant?: "comment" | "file";
};

type MarkdownBlock =
  | { type: "blockquote"; text: string }
  | { type: "code"; code: string; language: string }
  | { type: "heading"; level: number; text: string }
  | { type: "horizontalRule" }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export const MarkdownViewer = component$(
  ({
    class: className = "",
    content,
    fileName,
    sanitizedHtml,
    variant = "file",
  }: MarkdownViewerProps) => {
    const blocks = parseMarkdown(sanitizeMarkdownContent(content));
    const shellClass =
      variant === "comment"
        ? "markdown-viewer markdown-viewer--comment"
        : "markdown-viewer markdown-viewer--file";
    const emptyLabel =
      variant === "comment" ? "Nothing to preview yet." : "This file is empty.";

    return (
      <article class={[shellClass, className]}>
        {fileName ? (
          <div class="markdown-viewer__file-header">
            {fileIcon(fileName)}
            <span class="markdown-viewer__file-name">{fileName}</span>
          </div>
        ) : null}

        {sanitizedHtml ? (
          <div
            class="markdown-viewer__content"
            dangerouslySetInnerHTML={sanitizedHtml}
          />
        ) : blocks.length === 0 ? (
          <p class="markdown-viewer__empty">{emptyLabel}</p>
        ) : (
          <div class="markdown-viewer__content">
            {blocks.map((block, index) => renderBlock(block, index, variant))}
          </div>
        )}
      </article>
    );
  },
);

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

function renderBlock(
  block: MarkdownBlock,
  index: number,
  variant: MarkdownViewerProps["variant"],
) {
  switch (block.type) {
    case "heading": {
      const className =
        variant === "comment"
          ? block.level === 1
            ? "markdown-viewer__heading markdown-viewer__heading--comment-1"
            : "markdown-viewer__heading markdown-viewer__heading--comment-2"
          : block.level === 1
            ? "markdown-viewer__heading markdown-viewer__heading--1"
            : block.level === 2
              ? "markdown-viewer__heading markdown-viewer__heading--2"
              : "markdown-viewer__heading markdown-viewer__heading--3";
      if (block.level === 1) {
        return (
          <h1 class={className} key={index}>
            {renderInline(block.text)}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2 class={className} key={index}>
            {renderInline(block.text)}
          </h2>
        );
      }
      return (
        <h3 class={className} key={index}>
          {renderInline(block.text)}
        </h3>
      );
    }
    case "paragraph":
      return (
        <p class="markdown-viewer__paragraph" key={index}>
          {renderInline(block.text)}
        </p>
      );
    case "list":
      return (
        <ul class="markdown-viewer__list" key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "blockquote":
      return (
        <blockquote class="markdown-viewer__blockquote" key={index}>
          {renderInline(block.text)}
        </blockquote>
      );
    case "code":
      return (
        <div class="markdown-viewer__code-shell" key={index}>
          <div class="markdown-viewer__code-label">{block.language || "code"}</div>
          <pre class="markdown-viewer__pre">
            <code>{highlightCode(block.code, block.language)}</code>
          </pre>
        </div>
      );
    case "horizontalRule":
      return <hr class="markdown-viewer__rule" key={index} />;
  }
}

function renderInline(text: string): JSXOutput[] {
  const nodes: JSXOutput[] = [];
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
        <code
          class="markdown-viewer__inline-code"
          key={`${token}-${match.index}`}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("![")) {
      const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      const src = safeMarkdownHref(image?.[2] ?? "");
      nodes.push(
        <span class="markdown-viewer__inline-image" key={`${token}-${match.index}`}>
          <img
            alt={image?.[1] ?? ""}
            class="markdown-viewer__image"
            height={420}
            src={src}
            width={800}
          />
        </span>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = safeMarkdownHref(link?.[2] ?? "");
      nodes.push(
        <a
          class="markdown-viewer__link"
          href={href}
          key={`${token}-${match.index}`}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
          target={href.startsWith("http") ? "_blank" : undefined}
        >
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
  if (
    ["js", "jsx", "javascript", "ts", "tsx", "typescript"].includes(normalized)
  ) {
    return highlightKeywords(
      code,
      /\b(await|async|break|case|catch|class|const|continue|default|else|export|extends|finally|for|from|function|if|import|let|new|return|switch|throw|try|type|var|while)\b/g,
    );
  }
  if (["rs", "rust"].includes(normalized)) {
    return highlightKeywords(
      code,
      /\b(async|await|break|const|continue|crate|else|enum|fn|for|if|impl|let|match|mod|mut|pub|return|self|struct|trait|use|where|while)\b/g,
    );
  }
  if (["py", "python"].includes(normalized)) {
    return highlightKeywords(
      code,
      /\b(and|as|async|await|break|class|continue|def|elif|else|except|False|for|from|if|import|in|is|lambda|None|not|or|pass|return|True|try|while|with|yield)\b/g,
    );
  }
  if (["sh", "bash", "shell"].includes(normalized)) {
    return highlightKeywords(
      code,
      /\b(case|do|done|elif|else|esac|fi|for|function|if|in|then|while)\b/g,
    );
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
      return (
        <span class="markdown-viewer__code-string" key={index}>
          {part}
        </span>
      );
    }
    if (/^(\/\/|#)/.test(part)) {
      return (
        <span class="markdown-viewer__code-comment" key={index}>
          {part}
        </span>
      );
    }
    return part.split(keywordPattern).map((token, tokenIndex) =>
      keywordMatcher.test(token) ? (
        <span class="markdown-viewer__code-keyword" key={`${index}-${tokenIndex}`}>
          {token}
        </span>
      ) : (
        token
      ),
    );
  });
}

function highlightJson(code: string) {
  return code
    .split(/("(?:\\.|[^"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?)/g)
    .map((part, index) => {
      if (/^"/.test(part)) {
        return (
          <span class="markdown-viewer__code-string" key={index}>
            {part}
          </span>
        );
      }
      if (/^(true|false|null)$/.test(part)) {
        return (
          <span class="markdown-viewer__code-keyword" key={index}>
            {part}
          </span>
        );
      }
      if (/^-?\d/.test(part)) {
        return (
          <span class="markdown-viewer__code-number" key={index}>
            {part}
          </span>
        );
      }
      return part;
    });
}

export function safeMarkdownHref(href: string) {
  const trimmed = href.trim();
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed || "#";
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
      ? trimmed
      : "#";
  } catch {
    return "#";
  }
}

function fileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "md" || extension === "mdx") {
    return <span class="markdown-viewer__file-icon markdown-viewer__file-icon--md">MD</span>;
  }
  if (extension === "json" || extension === "yml" || extension === "yaml") {
    return <span class="markdown-viewer__file-icon markdown-viewer__file-icon--cfg">CFG</span>;
  }
  if (
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "svg"
  ) {
    return <span class="markdown-viewer__file-icon markdown-viewer__file-icon--img">IMG</span>;
  }
  return <span class="markdown-viewer__file-icon">FILE</span>;
}
