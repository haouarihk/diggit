import type { RepositoryDiffFile, RepositoryDiffLine } from "@/lib/api";

type CodeDiffProps = {
  files: RepositoryDiffFile[];
  emptyLabel?: string;
  focusPath?: string;
};

export function CodeDiff({ files, emptyLabel = "No file changes.", focusPath }: CodeDiffProps) {
  const visibleFiles = focusPath ? focusDiffFiles(files, focusPath) : files;

  if (files.length === 0) {
    return (
      <div className="rounded-md border border-[#d0d7de] bg-white p-4 text-[#59636e]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {visibleFiles.map((file, fileIndex) => {
        const isFocused = Boolean(focusPath && diffFileMatchesPath(file, focusPath));
        return (
          <article
            className={`overflow-hidden rounded-md border bg-white ${
              isFocused ? "border-[#0969da] shadow-sm" : "border-[#d0d7de]"
            }`}
            id={isFocused && fileIndex === 0 ? "focused-diff-file" : undefined}
            key={`${file.old_path ?? ""}:${file.new_path ?? ""}`}
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-semibold">{file.new_path ?? file.old_path ?? "file"}</div>
                {file.old_path && file.new_path && file.old_path !== file.new_path ? (
                  <div className="truncate text-xs text-[#59636e]">Renamed from {file.old_path}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-[#1a7f37]">+{file.additions}</span>
                <span className="text-[#cf222e]">-{file.deletions}</span>
                <span className="rounded-full border border-[#d0d7de] px-2 py-0.5 text-[#59636e]">{file.status}</span>
              </div>
            </header>
            <div className="overflow-x-auto">
              {file.hunks.map((hunk) => (
                <div key={hunk.header}>
                  <div className="border-b border-[#d8dee4] bg-[#ddf4ff] px-4 py-1 font-mono text-xs text-[#59636e]">
                    {hunk.header}
                  </div>
                  <table className="w-full border-collapse font-mono text-xs leading-5">
                    <tbody>
                      {hunk.lines.map((line, index) => (
                        <DiffRow fileKey={file.new_path ?? file.old_path ?? "file"} index={index} key={`${hunk.header}:${index}`} line={line} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function focusDiffFiles(files: RepositoryDiffFile[], focusPath: string) {
  const matchingFiles = files.filter((file) => diffFileMatchesPath(file, focusPath));
  if (matchingFiles.length === 0) {
    return files;
  }

  const rest = files.filter((file) => !diffFileMatchesPath(file, focusPath));
  return [...matchingFiles, ...rest];
}

function diffFileMatchesPath(file: RepositoryDiffFile, focusPath: string) {
  return [file.new_path, file.old_path]
    .filter((path): path is string => Boolean(path))
    .some((path) => path === focusPath || path.startsWith(`${focusPath}/`));
}

function DiffRow({ fileKey, index, line }: { fileKey: string; index: number; line: RepositoryDiffLine }) {
  const style = diffStyle(line.kind);
  return (
    <tr className={style.row}>
      <td className="w-14 select-none border-r border-[#d8dee4] px-2 text-right text-[#59636e]">
        {line.old_line ?? ""}
      </td>
      <td className="w-14 select-none border-r border-[#d8dee4] px-2 text-right text-[#59636e]">
        {line.new_line ?? ""}
      </td>
      <td className="w-6 select-none px-2 text-center">{style.marker}</td>
      <td className="min-w-[320px] whitespace-pre px-2" data-testid={`diff-line-${fileKey}-${index}`}>
        {line.content || " "}
      </td>
    </tr>
  );
}

function diffStyle(kind: RepositoryDiffLine["kind"]) {
  if (kind === "addition") {
    return { marker: "+", row: "bg-[#dafbe1]" };
  }
  if (kind === "deletion") {
    return { marker: "-", row: "bg-[#ffebe9]" };
  }
  return { marker: " ", row: "bg-white" };
}
