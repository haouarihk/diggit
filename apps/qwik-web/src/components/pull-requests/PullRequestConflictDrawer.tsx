import {
  $,
  component$,
  type PropFunction,
  useSignal,
  useTask$,
} from "@builder.io/qwik";

import { Drawer } from "~/components/ui/Drawer";
import type {
  PullRequestConflictFile,
  PullRequestConflictResolutionChoice,
} from "~/lib/api";

type PullRequestConflictDrawerProps = {
  currentLabel: string;
  files: PullRequestConflictFile[];
  incomingLabel: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose$: PropFunction<() => void>;
  onResolve$: PropFunction<() => void>;
  onSelectResolution$: PropFunction<
    (payload: {
      path: string;
      resolution: PullRequestConflictResolutionChoice;
    }) => void
  >;
  resolutions: Partial<Record<string, PullRequestConflictResolutionChoice>>;
};

export const PullRequestConflictDrawer = component$(
  ({
    currentLabel,
    files,
    incomingLabel,
    isOpen,
    isSubmitting,
    onClose$,
    onResolve$,
    onSelectResolution$,
    resolutions,
  }: PullRequestConflictDrawerProps) => {
    const selectedPath = useSignal(files[0]?.path ?? "");

    useTask$(({ track }) => {
      track(() => isOpen);
      track(() => files.map((file) => file.path).join("|"));
      if (!isOpen) {
        return;
      }
      if (!files.some((file) => file.path === selectedPath.value)) {
        selectedPath.value = files[0]?.path ?? "";
      }
    });

    const selectedFile =
      files.find((file) => file.path === selectedPath.value) ?? files[0] ?? null;
    const hasUnsupportedFiles = files.some((file) => !file.can_resolve);
    const canSubmit =
      files.length > 0 &&
      !hasUnsupportedFiles &&
      files.every((file) => Boolean(resolutions[file.path]));

    return (
      <Drawer
        isOpen={isOpen}
        onClose$={onClose$}
        subtitle="Choose how each conflicted file should be resolved."
        title="Resolve merge conflicts"
      >
        <div class="pull-request-conflict-drawer">
          <div class="pull-request-conflict-drawer__summary">
            <span class="pull-request-flow__status-pill">
              {files.length} conflicted {files.length === 1 ? "file" : "files"}
            </span>
            <p class="issue-detail-page__meta">
              Keep current uses <strong>{currentLabel}</strong>. Accept incoming uses{" "}
              <strong>{incomingLabel}</strong>.
            </p>
            {hasUnsupportedFiles ? (
              <p class="issue-detail-page__message">
                Some conflicted files are binary or larger than 800 KB, so this pull
                request must be resolved locally.
              </p>
            ) : null}
          </div>

          <div class="pull-request-conflict-drawer__layout">
            <div class="pull-request-conflict-drawer__files">
              {files.map((file) => {
                const resolution = resolutions[file.path];
                return (
                  <button
                    key={file.path}
                    class={[
                      "pull-request-conflict-drawer__file",
                      selectedPath.value === file.path
                        ? "pull-request-conflict-drawer__file--selected"
                        : "",
                    ]}
                    type="button"
                    onClick$={$(() => {
                      selectedPath.value = file.path;
                    })}
                  >
                    <span class="pull-request-conflict-drawer__file-path">{file.path}</span>
                    <span class="pull-request-conflict-drawer__file-state">
                      {file.can_resolve
                        ? resolution === "keep_current"
                          ? `Keeping ${currentLabel}`
                          : resolution === "accept_incoming"
                            ? `Accepting ${incomingLabel}`
                            : "Needs choice"
                        : file.reason ?? "Resolve locally"}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedFile ? (
              <div class="pull-request-conflict-drawer__preview">
                <div class="pull-request-conflict-drawer__preview-header">
                  <div>
                    <h3 class="pull-request-conflict-drawer__preview-title">
                      {selectedFile.path}
                    </h3>
                    <p class="issue-detail-page__meta">
                      {selectedFile.can_resolve
                        ? "Pick one version for this file."
                        : selectedFile.reason ?? "Resolve this file locally."}
                    </p>
                  </div>

                  {selectedFile.can_resolve ? (
                    <div class="pull-request-conflict-drawer__actions">
                      <button
                        class={
                          resolutions[selectedFile.path] === "keep_current"
                            ? "settings-resource-panel__primary-button"
                            : "settings-resource-panel__secondary-button"
                        }
                        type="button"
                        onClick$={() =>
                          onSelectResolution$({
                            path: selectedFile.path,
                            resolution: "keep_current",
                          })
                        }
                      >
                        Keep current ({currentLabel})
                      </button>
                      <button
                        class={
                          resolutions[selectedFile.path] === "accept_incoming"
                            ? "settings-resource-panel__primary-button"
                            : "settings-resource-panel__secondary-button"
                        }
                        type="button"
                        onClick$={() =>
                          onSelectResolution$({
                            path: selectedFile.path,
                            resolution: "accept_incoming",
                          })
                        }
                      >
                        Accept incoming ({incomingLabel})
                      </button>
                    </div>
                  ) : null}
                </div>

                <div class="pull-request-conflict-drawer__versions">
                  <ConflictFileVersionCard
                    content={selectedFile.current_content}
                    exists={selectedFile.current_exists}
                    isBinary={selectedFile.current_is_binary}
                    label={currentLabel}
                    size={selectedFile.current_size}
                  />
                  <ConflictFileVersionCard
                    content={selectedFile.incoming_content}
                    exists={selectedFile.incoming_exists}
                    isBinary={selectedFile.incoming_is_binary}
                    label={incomingLabel}
                    size={selectedFile.incoming_size}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div class="pull-request-conflict-drawer__footer">
            <span class="issue-detail-page__meta">
              {hasUnsupportedFiles
                ? "Finish resolving unsupported files locally, then push the source branch."
                : "Submit once every conflicted file has a choice."}
            </span>
            <button
              class="settings-resource-panel__primary-button"
              disabled={!canSubmit || isSubmitting}
              type="button"
              onClick$={onResolve$}
            >
              {isSubmitting ? "Applying..." : "Apply conflict resolutions"}
            </button>
          </div>
        </div>
      </Drawer>
    );
  },
);

const ConflictFileVersionCard = component$(
  ({
    content,
    exists,
    isBinary,
    label,
    size,
  }: {
    content: string | null;
    exists: boolean;
    isBinary: boolean;
    label: string;
    size: number | null;
  }) => {
    return (
      <section class="pull-request-conflict-drawer__version-card">
        <header class="pull-request-conflict-drawer__version-header">
          <div>
            <h4 class="pull-request-conflict-drawer__version-title">{label}</h4>
            <p class="issue-detail-page__meta">
              {!exists
                ? "This file does not exist on this branch."
                : isBinary
                  ? "Binary file"
                  : size != null
                    ? formatBytes(size)
                    : "Text file"}
            </p>
          </div>
        </header>
        <div class="pull-request-conflict-drawer__version-body">
          {!exists ? (
            <p class="issue-detail-page__empty-copy">Deleted on this branch.</p>
          ) : isBinary ? (
            <p class="issue-detail-page__empty-copy">
              Binary files are not shown in the web resolver.
            </p>
          ) : content != null ? (
            <pre class="pull-request-conflict-drawer__code">{content}</pre>
          ) : (
            <p class="issue-detail-page__empty-copy">
              This file is larger than 800 KB and is not shown in the web resolver.
            </p>
          )}
        </div>
      </section>
    );
  },
);

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
