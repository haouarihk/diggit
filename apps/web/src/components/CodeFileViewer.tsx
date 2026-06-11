import { codeToHtml, type BuiltinLanguage } from "shiki";
import type { RepositoryFile } from "@/lib/api";
import { FileTypeIcon } from "./IconForFile";

type CodeFileViewerProps = {
  file: Pick<RepositoryFile, "content" | "extension" | "name" | "path" | "size">;
};

export type FileLanguage = {
  language: BuiltinLanguage | "text";
  label: string;
};

const LANGUAGE_BY_EXTENSION: Record<string, FileLanguage> = {
  bash: { language: "bash", label: "Shell" },
  c: { language: "c", label: "C" },
  cjs: { language: "javascript", label: "JavaScript" },
  cpp: { language: "cpp", label: "C++" },
  cs: { language: "csharp", label: "C#" },
  css: { language: "css", label: "CSS" },
  go: { language: "go", label: "Go" },
  h: { language: "c", label: "C" },
  html: { language: "html", label: "HTML" },
  java: { language: "java", label: "Java" },
  js: { language: "javascript", label: "JavaScript" },
  json: { language: "json", label: "JSON" },
  jsonc: { language: "jsonc", label: "JSONC" },
  jsx: { language: "jsx", label: "JSX" },
  kt: { language: "kotlin", label: "Kotlin" },
  less: { language: "less", label: "Less" },
  lua: { language: "lua", label: "Lua" },
  md: { language: "markdown", label: "Markdown" },
  mdx: { language: "mdx", label: "MDX" },
  mjs: { language: "javascript", label: "JavaScript" },
  php: { language: "php", label: "PHP" },
  prisma: { language: "prisma", label: "Prisma" },
  py: { language: "python", label: "Python" },
  rb: { language: "ruby", label: "Ruby" },
  rs: { language: "rust", label: "Rust" },
  sass: { language: "sass", label: "Sass" },
  scss: { language: "scss", label: "SCSS" },
  sh: { language: "bash", label: "Shell" },
  sql: { language: "sql", label: "SQL" },
  svg: { language: "xml", label: "SVG" },
  toml: { language: "toml", label: "TOML" },
  ts: { language: "typescript", label: "TypeScript" },
  tsx: { language: "tsx", label: "TSX" },
  xml: { language: "xml", label: "XML" },
  yaml: { language: "yaml", label: "YAML" },
  yml: { language: "yaml", label: "YAML" },
  zsh: { language: "zsh", label: "Shell" },
};

const LANGUAGE_BY_FILE_NAME: Record<string, FileLanguage> = {
  dockerfile: { language: "dockerfile", label: "Dockerfile" },
  makefile: { language: "make", label: "Makefile" },
};

const TEXT_LANGUAGE: FileLanguage = { language: "text", label: "Plain text" };

export async function CodeFileViewer({ file }: CodeFileViewerProps) {
  const fileLanguage = resolveFileLanguage(file);
  const highlightedHtml = await codeToHtml(file.content || " ", {
    defaultColor: false,
    lang: fileLanguage.language as BuiltinLanguage,
    themes: {
      dark: "github-dark",
      light: "github-light",
    },
  });

  return (
    <div className="rounded-b-md border border-t-0 border-[#d0d7de] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#d8dee4] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileTypeIcon entry={{ extension: file.extension, name: file.name }} />
          <span className="truncate font-semibold">{file.path}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-[#59636e]">
          <span>{fileLanguage.label}</span>
          <span>{formatBytes(file.size)}</span>
        </div>
      </div>
      <div className="overflow-x-auto p-4 font-mono text-sm leading-6">
        <div className="code-file-viewer min-w-max" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </div>
    </div>
  );
}

export function resolveFileLanguage(file: Pick<RepositoryFile, "extension" | "name" | "path">): FileLanguage {
  const fileName = (file.name || file.path.split("/").pop() || "").toLowerCase();
  const extension = normalizeExtension(file.extension) || normalizeExtension(fileName.split(".").pop());

  if (fileName in LANGUAGE_BY_FILE_NAME) {
    return LANGUAGE_BY_FILE_NAME[fileName];
  }

  if (fileName === ".env" || fileName.startsWith(".env.")) {
    return { language: "dotenv", label: "Environment" };
  }

  return (extension && LANGUAGE_BY_EXTENSION[extension]) || TEXT_LANGUAGE;
}

function normalizeExtension(extension?: string | null) {
  return extension?.replace(/^\./, "").toLowerCase() || "";
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
