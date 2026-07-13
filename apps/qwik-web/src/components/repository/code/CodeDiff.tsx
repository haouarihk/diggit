import { component$ } from "@builder.io/qwik";

import type { RepositoryDiffFile, RepositoryDiffLine } from "~/lib/api";

type CodeDiffProps = {
  emptyLabel?: string;
  files: RepositoryDiffFile[];
  focusPath?: string;
};

export const CodeDiff = component$(
  ({ emptyLabel = "No file changes.", files, focusPath }: CodeDiffProps) => {
    const visibleFiles = focusPath ? focusDiffFiles(files, focusPath) : files;

    if (files.length === 0) {
      return <div class="code-diff__empty">{emptyLabel}</div>;
    }

    return (
      <div class="code-diff">
        {visibleFiles.map((file, fileIndex) => {
          const isFocused = Boolean(focusPath && diffFileMatchesPath(file, focusPath));
          return (
            <article
              key={`${file.old_path ?? ""}:${file.new_path ?? ""}`}
              class={[
                "code-diff__file",
                isFocused ? "code-diff__file--focused" : "",
              ]}
              id={isFocused && fileIndex === 0 ? "focused-diff-file" : undefined}
            >
              <header class="code-diff__file-header">
                <div class="code-diff__file-title-wrap">
                  <div class="code-diff__file-title">
                    {file.new_path ?? file.old_path ?? "file"}
                  </div>
                  {file.old_path &&
                  file.new_path &&
                  file.old_path !== file.new_path ? (
                    <div class="code-diff__file-subtitle">
                      Renamed from {file.old_path}
                    </div>
                  ) : null}
                </div>
                <div class="code-diff__stats">
                  <span class="code-diff__stat code-diff__stat--add">
                    +{file.additions}
                  </span>
                  <span class="code-diff__stat code-diff__stat--remove">
                    -{file.deletions}
                  </span>
                  <span class="code-diff__status">{file.status}</span>
                </div>
              </header>

              <div class="code-diff__scroll">
                {file.hunks.map((hunk) => (
                  <div key={hunk.header}>
                    <div class="code-diff__hunk-header">{hunk.header}</div>
                    <table class="code-diff__table">
                      <tbody>
                        {hunk.lines.map((line, index) => (
                          <DiffRow
                            key={`${hunk.header}:${index}`}
                            fileKey={file.new_path ?? file.old_path ?? "file"}
                            index={index}
                            line={line}
                          />
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
  },
);

const DiffRow = component$(
  ({
    fileKey,
    index,
    line,
  }: {
    fileKey: string;
    index: number;
    line: RepositoryDiffLine;
  }) => {
    const style = diffStyle(line.kind);
    return (
      <tr class={["code-diff__row", style.row]}>
        <td class="code-diff__line-number">{line.old_line ?? ""}</td>
        <td class="code-diff__line-number">{line.new_line ?? ""}</td>
        <td class="code-diff__marker">{style.marker}</td>
        <td
          class="code-diff__content"
          data-testid={`diff-line-${fileKey}-${index}`}
        >
          {line.content || " "}
        </td>
      </tr>
    );
  },
);

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

function diffStyle(kind: RepositoryDiffLine["kind"]) {
  if (kind === "addition") {
    return { marker: "+", row: "code-diff__row--addition" };
  }
  if (kind === "deletion") {
    return { marker: "-", row: "code-diff__row--deletion" };
  }
  return { marker: " ", row: "" };
}
