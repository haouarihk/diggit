import { component$ } from "@builder.io/qwik";
import type { RepositoryFile } from "~/lib/api";

type CodeFileViewerProps = {
  file: Pick<RepositoryFile, "content" | "extension" | "name" | "path" | "size">;
};

export const CodeFileViewer = component$(({ file }: CodeFileViewerProps) => {
  const fileLanguage = resolveFileLanguage(file);

  return (
    <div class="code-file-viewer">
      <div class="code-file-viewer__header">
        <div class="code-file-viewer__meta">
          <span class="code-file-viewer__file">{file.path}</span>
        </div>
        <div class="code-file-viewer__facts">
          <span>{fileLanguage.label}</span>
          <span>{formatBytes(file.size)}</span>
        </div>
      </div>
      <pre class="code-file-viewer__content">
        <code>{file.content || " "}</code>
      </pre>
    </div>
  );
});

type FileLanguage = {
  label: string;
};

const LANGUAGE_BY_EXTENSION: Record<string, FileLanguage> = {
  bash: { label: "Shell" },
  c: { label: "C" },
  cjs: { label: "JavaScript" },
  cpp: { label: "C++" },
  css: { label: "CSS" },
  go: { label: "Go" },
  h: { label: "C" },
  html: { label: "HTML" },
  java: { label: "Java" },
  js: { label: "JavaScript" },
  json: { label: "JSON" },
  jsonc: { label: "JSONC" },
  jsx: { label: "JSX" },
  kt: { label: "Kotlin" },
  less: { label: "Less" },
  lua: { label: "Lua" },
  md: { label: "Markdown" },
  mdx: { label: "MDX" },
  mjs: { label: "JavaScript" },
  php: { label: "PHP" },
  prisma: { label: "Prisma" },
  py: { label: "Python" },
  rb: { label: "Ruby" },
  rs: { label: "Rust" },
  sass: { label: "Sass" },
  scss: { label: "SCSS" },
  sh: { label: "Shell" },
  sql: { label: "SQL" },
  svg: { label: "SVG" },
  toml: { label: "TOML" },
  ts: { label: "TypeScript" },
  tsx: { label: "TSX" },
  xml: { label: "XML" },
  yaml: { label: "YAML" },
  yml: { label: "YAML" },
  zsh: { label: "Shell" },
};

const LANGUAGE_BY_FILE_NAME: Record<string, FileLanguage> = {
  dockerfile: { label: "Dockerfile" },
  makefile: { label: "Makefile" },
};

const TEXT_LANGUAGE: FileLanguage = { label: "Plain text" };

function resolveFileLanguage(
  file: Pick<RepositoryFile, "extension" | "name" | "path">,
): FileLanguage {
  const fileName = (file.name || file.path.split("/").pop() || "").toLowerCase();
  const extension =
    normalizeExtension(file.extension) || normalizeExtension(fileName.split(".").pop());

  if (fileName in LANGUAGE_BY_FILE_NAME) {
    return LANGUAGE_BY_FILE_NAME[fileName];
  }

  if (fileName === ".env" || fileName.startsWith(".env.")) {
    return { label: "Environment" };
  }

  return (extension && LANGUAGE_BY_EXTENSION[extension]) || TEXT_LANGUAGE;
}

function normalizeExtension(extension?: string | null) {
  return extension?.replace(/^\./, "").toLowerCase() || "";
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
