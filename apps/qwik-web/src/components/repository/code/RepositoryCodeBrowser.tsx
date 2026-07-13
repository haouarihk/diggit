import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { CodeFileViewer } from "~/components/repository/code/CodeFileViewer";
import {
  type Repository,
  type RepositoryBranch,
  type RepositoryFile,
  type RepositoryTag,
  type RepositoryTree,
  type RepositoryTreeEntry,
  repositoryRawFileUrl,
} from "~/lib/api";

type RepositoryCodeBrowserProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  currentPath: string;
  file?: RepositoryFile | null;
  fullTree: RepositoryTree;
  mode: "blob" | "tree";
  repo: Repository;
  selectedRef: string;
  tags: RepositoryTag[];
  tree: RepositoryTree;
  query?: string;
  readme?: RepositoryFile | null;
};

type RepositoryTreeNode = {
  children: RepositoryTreeNode[];
  entry: RepositoryTreeEntry;
};

export const RepositoryCodeBrowser = component$(
  ({
    baseHref,
    branches,
    currentPath,
    file,
    fullTree,
    mode,
    query = "",
    readme = null,
    repo,
    selectedRef,
    tags,
    tree,
  }: RepositoryCodeBrowserProps) => {
    const filteredEntries = query
      ? tree.entries.filter((entry) =>
          entry.path.toLowerCase().includes(query.toLowerCase()),
        )
      : tree.entries;
    const treeNodes = buildRepositoryTreeNodes(fullTree.entries);

    return (
      <div class="repository-code-browser">
        <div class="repository-code-browser__main">
          <RepositoryCodeToolbar
            baseHref={baseHref}
            branches={branches}
            currentPath={currentPath}
            mode={mode}
            query={query}
            repo={repo}
            selectedRef={selectedRef}
            tags={tags}
          />

          <section>
            <FocusedHeader
              baseHref={baseHref}
              currentPath={currentPath}
              file={file}
              mode={mode}
              repo={repo}
              selectedRef={selectedRef}
              tree={tree}
            />
            {mode === "blob" ? (
              <RepositoryFilePreview
                file={file ?? null}
                rawUrl={
                  file
                    ? repositoryRawFileUrl(
                        repo.owner_handle,
                        repo.name,
                        file.path,
                        selectedRef,
                      )
                    : null
                }
                repo={repo}
              />
            ) : (
              <>
                <RepositoryFileTable
                  baseHref={baseHref}
                  entries={filteredEntries}
                  selectedRef={selectedRef}
                />
                <RepositoryReadme readme={readme} />
              </>
            )}
          </section>
        </div>

        <RepositoryTreeSidebar
          baseHref={baseHref}
          branches={branches}
          currentPath={currentPath}
          mode={mode}
          repo={repo}
          selectedPath={currentPath}
          selectedRef={selectedRef}
          tags={tags}
          treeNodes={treeNodes}
        />
      </div>
    );
  },
);

const RepositoryCodeToolbar = component$(
  ({
    baseHref,
    branches,
    currentPath,
    mode,
    query,
    repo,
    selectedRef,
    tags,
  }: {
    baseHref: string;
    branches: RepositoryBranch[];
    currentPath: string;
    mode: "blob" | "tree";
    query: string;
    repo: Repository;
    selectedRef: string;
    tags: RepositoryTag[];
  }) => {
    const selectedRefExists = Boolean(
      branches.find((branch) => branch.name === selectedRef)?.commit_sha ||
        tags.find((tag) => tag.name === selectedRef)?.commit_sha,
    );

    return (
      <div class="repository-toolbar">
        <div class="repository-toolbar__left">
          <details class="repository-ref-switcher" data-ui-dropdown="true">
            <summary class="repository-ref-switcher__summary">
              <span class="repository-ref-switcher__icon">⎇</span>
              <span class="repository-ref-switcher__label">{selectedRef}</span>
            </summary>
            <div class="repository-ref-switcher__panel">
              <div class="repository-ref-switcher__section">
                <div class="repository-ref-switcher__heading">Branches</div>
                {branches.length > 0 ? (
                  branches.map((branch) => (
                    <Link
                      class={[
                        "repository-ref-switcher__link",
                        branch.name === selectedRef
                          ? "repository-ref-switcher__link--active"
                          : "",
                      ]}
                      href={refHref(baseHref, branch.name, currentPath, mode)}
                      key={branch.name}
                    >
                      <span>{branch.name}</span>
                      {branch.is_default ? (
                        <span class="repository-ref-switcher__badge">Default</span>
                      ) : null}
                    </Link>
                  ))
                ) : (
                  <div class="repository-ref-switcher__empty">No branches found.</div>
                )}
              </div>
              <div class="repository-ref-switcher__section">
                <div class="repository-ref-switcher__heading">Tags</div>
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <Link
                      class={[
                        "repository-ref-switcher__link",
                        tag.name === selectedRef
                          ? "repository-ref-switcher__link--active"
                          : "",
                      ]}
                      href={refHref(baseHref, tag.name, currentPath, mode)}
                      key={tag.name}
                    >
                      <span>{tag.name}</span>
                    </Link>
                  ))
                ) : (
                  <div class="repository-ref-switcher__empty">No tags found.</div>
                )}
              </div>
            </div>
          </details>
        </div>

        <div class="repository-toolbar__right">
          <form
            action={searchActionHref(baseHref, currentPath, mode, selectedRef)}
            class="repository-toolbar__search"
          >
            <input name="ref" type="hidden" value={selectedRef} />
            <input
              class="repository-toolbar__search-input"
              defaultValue={query}
              name="q"
              placeholder="Find file"
              type="search"
            />
          </form>
          <details class="repository-clone" data-ui-dropdown="true">
            <summary class="repository-clone__summary">Code</summary>
            <div class="repository-clone__panel">
              <CloneUrl
                label="SSH"
                value={cloneCommand(
                  repo.ssh_url,
                  selectedRef,
                  repo.default_branch,
                  selectedRefExists,
                )}
              />
              <CloneUrl
                label="HTTP"
                value={cloneCommand(
                  repo.http_url,
                  selectedRef,
                  repo.default_branch,
                  selectedRefExists,
                )}
              />
            </div>
          </details>
        </div>
      </div>
    );
  },
);

const FocusedHeader = component$(
  ({
    baseHref,
    currentPath,
    file,
    mode,
    repo,
    selectedRef,
    tree,
  }: {
    baseHref: string;
    currentPath: string;
    file?: RepositoryFile | null;
    mode: "blob" | "tree";
    repo: Repository;
    selectedRef: string;
    tree: RepositoryTree;
  }) => {
    const commit = mode === "blob" ? file?.last_commit : tree.last_commit;

    return (
      <header class="repository-focused-header">
        <div class="repository-focused-header__main">
          <RepositoryPathBreadcrumbs
            baseHref={baseHref}
            currentPath={currentPath}
            repo={repo}
            selectedRef={selectedRef}
          />
          <div class="repository-focused-header__meta">
            {commit ? (
              <>
                <span>{commit.author_name} updated</span>
                <Link
                  class="repository-focused-header__commit"
                  href={commitHref(baseHref, commit.sha, currentPath)}
                >
                  {commit.message}
                </Link>
                <span aria-hidden="true">&middot;</span>
                <span>{relativeTime(commit.created_at)}</span>
              </>
            ) : (
              <span>No commit information for this path.</span>
            )}
          </div>
        </div>
        {mode === "blob" && file ? (
          <div class="repository-focused-header__actions">
            {!file.is_binary && selectedRef === repo.default_branch ? (
              <Link
                class="repository-focused-header__button"
                href={`${baseHref}/edit?file=${encodeURIComponent(file.path)}`}
              >
                Edit
              </Link>
            ) : null}
            <a
              class="repository-focused-header__button repository-focused-header__button--danger"
              href={repositoryRawFileUrl(
                repo.owner_handle,
                repo.name,
                file.path,
                selectedRef,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Raw
            </a>
          </div>
        ) : null}
      </header>
    );
  },
);

const RepositoryPathBreadcrumbs = component$(
  ({
    baseHref,
    currentPath,
    repo,
    selectedRef,
  }: {
    baseHref: string;
    currentPath: string;
    repo: Repository;
    selectedRef: string;
  }) => {
    const segments = currentPath.split("/").filter(Boolean);

    return (
      <nav aria-label="Repository path" class="repository-path-breadcrumbs">
        <Link class="repository-path-breadcrumbs__link" href={codeHref(baseHref, undefined, selectedRef, "tree")}>
          {repo.name}
        </Link>
        {segments.map((segment, index) => {
          const path = segments.slice(0, index + 1).join("/");
          const isLast = index === segments.length - 1;
          return (
            <span class="repository-path-breadcrumbs__segment" key={path}>
              <span class="repository-path-breadcrumbs__separator">/</span>
              {isLast ? (
                <span class="repository-path-breadcrumbs__current">{segment}</span>
              ) : (
                <Link
                  class="repository-path-breadcrumbs__link"
                  href={codeHref(baseHref, path, selectedRef, "tree")}
                >
                  {segment}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    );
  },
);

const RepositoryFileTable = component$(
  ({
    baseHref,
    entries,
    selectedRef,
  }: {
    baseHref: string;
    entries: RepositoryTreeEntry[];
    selectedRef: string;
  }) => {
    if (entries.length === 0) {
      return <div class="repository-file-table__empty">No files found.</div>;
    }

    return (
      <div class="repository-file-table">
        {entries.map((entry) => (
          <div class="repository-file-row" key={entry.path}>
            <div class="repository-file-row__name">
              <span class="repository-file-row__icon">
                {entry.kind === "directory" ? "📁" : "📄"}
              </span>
              <Link
                class="repository-file-row__label"
                href={codeHref(
                  baseHref,
                  entry.path,
                  selectedRef,
                  entry.kind === "directory" ? "tree" : "blob",
                )}
              >
                {entry.name}
              </Link>
            </div>
            <div class="repository-file-row__message">
              {entry.last_commit ? (
                <Link
                  class="repository-file-row__message-link"
                  href={commitHref(baseHref, entry.last_commit.sha, entry.path)}
                >
                  {entry.last_commit.message}
                </Link>
              ) : (
                "No commit message"
              )}
            </div>
            <div class="repository-file-row__time">
              {entry.last_commit?.created_at
                ? relativeTime(entry.last_commit.created_at)
                : "Never"}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

const RepositoryReadme = component$(({ readme }: { readme?: RepositoryFile | null }) => {
  if (!readme) {
    return null;
  }

  return (
    <section class="repository-readme">
      <div class="repository-readme__header">README.md</div>
      <pre class="repository-readme__content">{readme.content}</pre>
    </section>
  );
});

const RepositoryFilePreview = component$(
  ({
    file,
    rawUrl,
    repo,
  }: {
    file: RepositoryFile | null;
    rawUrl: string | null;
    repo: Repository;
  }) => {
    if (!file) {
      return (
        <div class="repository-file-table__empty">
          No file selected in {repo.name}.
        </div>
      );
    }
    if (rawUrl && file.media_type.startsWith("image/")) {
      return (
        <div class="repository-file-preview">
          <img
            alt={file.name}
            class="repository-file-preview__media"
            height={720}
            src={rawUrl}
            width={1200}
          />
        </div>
      );
    }
    if (rawUrl && file.media_type.startsWith("video/")) {
      return (
        <div class="repository-file-preview">
          <video class="repository-file-preview__media" controls src={rawUrl} />
        </div>
      );
    }
    if (rawUrl && file.media_type === "application/pdf") {
      return (
        <div class="repository-file-preview">
          <iframe
            class="repository-file-preview__frame"
            src={rawUrl}
            title={file.name}
          />
        </div>
      );
    }
    if (file.extension === "md" || file.extension === "mdx") {
      return (
        <section class="repository-readme">
          <div class="repository-readme__header">{file.name}</div>
          <pre class="repository-readme__content">{file.content}</pre>
        </section>
      );
    }
    return <CodeFileViewer file={file} />;
  },
);

const RepositoryTreeSidebar = component$(
  ({
    baseHref,
    branches,
    currentPath,
    mode,
    repo,
    selectedPath,
    selectedRef,
    tags,
    treeNodes,
  }: {
    baseHref: string;
    branches: RepositoryBranch[];
    currentPath: string;
    mode: "blob" | "tree";
    repo: Repository;
    selectedPath: string;
    selectedRef: string;
    tags: RepositoryTag[];
    treeNodes: RepositoryTreeNode[];
  }) => {
    const parentPath = parentDirectoryPath(currentPath);

    return (
      <aside class="repository-tree-sidebar">
        <div class="repository-tree-sidebar__header">
          <Link
            class="repository-tree-sidebar__repo"
            href={codeHref(baseHref, undefined, selectedRef, "tree")}
          >
            {repo.owner_handle}/{repo.name}
          </Link>
          <p class="repository-tree-sidebar__copy">
            {mode === "blob" ? "File browser" : "Folder browser"}
          </p>
        </div>

        <div class="repository-tree-sidebar__controls">
          <details class="repository-ref-switcher" data-ui-dropdown="true">
            <summary class="repository-ref-switcher__summary">
              <span class="repository-ref-switcher__icon">⎇</span>
              <span class="repository-ref-switcher__label">{selectedRef}</span>
            </summary>
            <div class="repository-ref-switcher__panel">
              <div class="repository-ref-switcher__section">
                <div class="repository-ref-switcher__heading">Branches</div>
                {branches.map((branch) => (
                  <Link
                    class={[
                      "repository-ref-switcher__link",
                      branch.name === selectedRef
                        ? "repository-ref-switcher__link--active"
                        : "",
                    ]}
                    href={refHref(baseHref, branch.name, currentPath, mode)}
                    key={branch.name}
                  >
                    <span>{branch.name}</span>
                    {branch.is_default ? (
                      <span class="repository-ref-switcher__badge">Default</span>
                    ) : null}
                  </Link>
                ))}
              </div>
              <div class="repository-ref-switcher__section">
                <div class="repository-ref-switcher__heading">Tags</div>
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <Link
                      class={[
                        "repository-ref-switcher__link",
                        tag.name === selectedRef
                          ? "repository-ref-switcher__link--active"
                          : "",
                      ]}
                      href={refHref(baseHref, tag.name, currentPath, mode)}
                      key={tag.name}
                    >
                      <span>{tag.name}</span>
                    </Link>
                  ))
                ) : (
                  <div class="repository-ref-switcher__empty">No tags found.</div>
                )}
              </div>
            </div>
          </details>

          <div class="repository-tree-sidebar__links">
            <Link
              class="repository-tree-sidebar__nav-link"
              href={codeHref(baseHref, undefined, selectedRef, "tree")}
            >
              Repository root
            </Link>
            {currentPath ? (
              <Link
                class="repository-tree-sidebar__nav-link repository-tree-sidebar__nav-link--muted"
                href={
                  parentPath
                    ? codeHref(baseHref, parentPath, selectedRef, "tree")
                    : codeHref(baseHref, undefined, selectedRef, "tree")
                }
              >
                Up one level
              </Link>
            ) : null}
          </div>
        </div>

        <div class="repository-tree-sidebar__body">
          {treeNodes.length > 0 ? (
            <div class="repository-tree-sidebar__tree">
              {treeNodes.map((node) => (
                <TreeNodeView
                  baseHref={baseHref}
                  depth={0}
                  key={node.entry.path}
                  node={node}
                  selectedPath={selectedPath}
                  selectedRef={selectedRef}
                />
              ))}
            </div>
          ) : (
            <div class="repository-tree-sidebar__empty">This folder is empty.</div>
          )}
        </div>
      </aside>
    );
  },
);

const TreeNodeView = component$(
  ({
    baseHref,
    depth,
    node,
    selectedPath,
    selectedRef,
  }: {
    baseHref: string;
    depth: number;
    node: RepositoryTreeNode;
    selectedPath: string;
    selectedRef: string;
  }) => {
    const isDirectory = node.entry.kind === "directory";
    const hasChildren = node.children.length > 0;
    const isSelected = node.entry.path === selectedPath;
    const isExpanded =
      isDirectory && (selectedPath.startsWith(`${node.entry.path}/`) || isSelected);

    if (isDirectory && hasChildren) {
      return (
        <details class="repository-tree-node" open={isExpanded}>
          <summary
            class={[
              "repository-tree-node__summary",
              isSelected ? "repository-tree-node__summary--selected" : "",
            ]}
            style={{ paddingLeft: `${0.75 + depth * 0.9}rem` }}
          >
            <Link
              class="repository-tree-node__link"
              href={codeHref(baseHref, node.entry.path, selectedRef, "tree")}
            >
              <span class="repository-tree-node__icon">📁</span>
              <span class="repository-tree-node__name">{node.entry.name}</span>
            </Link>
          </summary>
          <div class="repository-tree-node__children">
            {node.children.map((child) => (
              <TreeNodeView
                baseHref={baseHref}
                depth={depth + 1}
                key={child.entry.path}
                node={child}
                selectedPath={selectedPath}
                selectedRef={selectedRef}
              />
            ))}
          </div>
        </details>
      );
    }

    return (
      <div
        class={[
          "repository-tree-node__leaf",
          isSelected ? "repository-tree-node__leaf--selected" : "",
        ]}
        style={{ paddingLeft: `${1.8 + depth * 0.9}rem` }}
      >
        <Link
          class="repository-tree-node__link"
          href={codeHref(
            baseHref,
            node.entry.path,
            selectedRef,
            isDirectory ? "tree" : "blob",
          )}
        >
          <span class="repository-tree-node__icon">
            {isDirectory ? "📁" : "📄"}
          </span>
          <span class="repository-tree-node__name">{node.entry.name}</span>
        </Link>
      </div>
    );
  },
);

const CloneUrl = component$(({ label, value }: { label: string; value: string }) => {
  return (
    <div class="repository-clone__item">
      <span class="repository-clone__label">{label}</span>
      <div class="repository-clone__value">{value}</div>
    </div>
  );
});

function refHref(
  baseHref: string,
  ref: string,
  currentPath: string,
  mode: "blob" | "tree",
) {
  const path = mode === "blob" ? currentPath : currentPath || undefined;
  return codeHref(baseHref, path, ref, mode);
}

function codeHref(
  baseHref: string,
  path: string | undefined,
  ref: string,
  mode: "blob" | "tree",
) {
  const query = new URLSearchParams({ ref });
  return path
    ? `${baseHref}/${mode}/${path.split("/").map(encodeURIComponent).join("/")}?${query}`
    : `${baseHref}/tree?${query}`;
}

function searchActionHref(
  baseHref: string,
  currentPath: string,
  mode: "blob" | "tree",
  ref: string,
) {
  const searchPath =
    mode === "blob" ? parentDirectoryPath(currentPath) : currentPath || undefined;
  return codeHref(baseHref, searchPath, ref, "tree");
}

function commitHref(baseHref: string, sha: string, path?: string) {
  if (!path) {
    return `${baseHref}/commits/${sha}`;
  }

  const query = new URLSearchParams({ path });
  return `${baseHref}/commits/${sha}?${query}`;
}

function cloneCommand(url: string, ref: string, defaultBranch: string, refExists: boolean) {
  return refExists && ref !== defaultBranch
    ? `git clone --branch ${shellArg(ref)} ${shellArg(url)}`
    : `git clone ${shellArg(url)}`;
}

function shellArg(value: string) {
  return /^[A-Za-z0-9_./:@-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

function relativeTime(value: string) {
  const deltaMs = new Date(value).getTime() - Date.now();
  const absMs = Math.abs(deltaMs);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];

  for (const [unit, ms] of units) {
    if (absMs >= ms) {
      return formatter.format(Math.round(deltaMs / ms), unit);
    }
  }

  return formatter.format(Math.round(deltaMs / 1000), "second");
}

function parentDirectoryPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length > 0 ? parts.join("/") : undefined;
}

function buildRepositoryTreeNodes(entries: RepositoryTreeEntry[]): RepositoryTreeNode[] {
  const rootNodes = new Map<string, MutableRepositoryTreeNode>();

  for (const entry of sortTreeEntries(entries)) {
    const segments = entry.path.split("/").filter(Boolean);
    let children = rootNodes;
    let path = "";

    segments.forEach((segment, index) => {
      path = path ? `${path}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      const existing = children.get(path);
      const node =
        existing ??
        createMutableTreeNode({
          extension: null,
          kind: isLeaf ? entry.kind : "directory",
          last_commit: null,
          name: segment,
          path,
          size: null,
        });

      if (isLeaf) {
        node.entry = entry;
      }

      children.set(path, node);
      children = node.childrenByPath;
    });
  }

  return finalizeTreeNodes([...rootNodes.values()]);
}

type MutableRepositoryTreeNode = RepositoryTreeNode & {
  childrenByPath: Map<string, MutableRepositoryTreeNode>;
};

function createMutableTreeNode(entry: RepositoryTreeEntry): MutableRepositoryTreeNode {
  return {
    children: [],
    childrenByPath: new Map(),
    entry,
  };
}

function finalizeTreeNodes(nodes: MutableRepositoryTreeNode[]): RepositoryTreeNode[] {
  return sortTreeNodes(nodes).map((node) => ({
    children: finalizeTreeNodes([...node.childrenByPath.values()]),
    entry: node.entry,
  }));
}

function sortTreeNodes(nodes: MutableRepositoryTreeNode[]) {
  return nodes.sort((a, b) => {
    if (a.entry.kind !== b.entry.kind) {
      return a.entry.kind === "directory" ? -1 : 1;
    }
    return a.entry.name.localeCompare(b.entry.name);
  });
}

function sortTreeEntries(entries: RepositoryTreeEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
