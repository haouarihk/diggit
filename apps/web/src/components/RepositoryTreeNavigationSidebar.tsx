"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import IconForFile from "@/components/IconForFile";
import { RepositoryRefSelector } from "@/components/RepositoryRefSelector";
import type {
  Repository,
  RepositoryBranch,
  RepositoryTag,
  RepositoryTreeEntry,
} from "@/lib/api";

type RepositoryTreeNavigationSidebarProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  currentPath: string;
  entries: RepositoryTreeEntry[];
  mode: "tree" | "blob";
  repo: Repository;
  selectedPath: string;
  selectedRef: string;
  tags: RepositoryTag[];
};

type RepositoryTreeNode = {
  children: RepositoryTreeNode[];
  entry: RepositoryTreeEntry;
};

type MutableRepositoryTreeNode = RepositoryTreeNode & {
  childrenByPath: Map<string, MutableRepositoryTreeNode>;
};

export function RepositoryTreeNavigationSidebar({
  baseHref,
  branches,
  currentPath,
  entries,
  mode,
  repo,
  selectedPath,
  selectedRef,
  tags,
}: RepositoryTreeNavigationSidebarProps) {
  const parentPath = parentDirectoryPath(currentPath);
  const treeNodes = useMemo(() => buildRepositoryTreeNodes(entries), [entries]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => selectedPathExpansion(selectedPath));

  function togglePath(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <aside className="overflow-hidden rounded-2xl border border-[#d0d7de] bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
      <div className="border-b border-[#d8dee4] p-4">
        <Link className="block truncate text-base font-semibold text-[#0969da] hover:underline" href={baseHref}>
          {repo.owner_handle}/{repo.name}
        </Link>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#59636e]">
          {mode === "blob" ? "File browser" : "Folder browser"}
        </p>
      </div>

      <div className="grid gap-3 border-b border-[#d8dee4] p-3">
        <div className="flex flex-wrap gap-2">
          <RepositoryRefSelector baseHref={baseHref} branches={branches} key={selectedRef} selectedRef={selectedRef} tags={tags} />
        </div>
        <div className="grid gap-1">
          <Link
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#1f2328] hover:bg-[#f6f8fa]"
            href={codeHref(baseHref, undefined, selectedRef, "tree")}
          >
            <FolderOpen className="h-4 w-4 text-[#0969da]" aria-hidden="true" />
            Repository root
          </Link>
          {currentPath ? (
            <Link
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#1f2328]"
              href={parentPath ? codeHref(baseHref, parentPath, selectedRef, "tree") : codeHref(baseHref, undefined, selectedRef, "tree")}
            >
              <Folder className="h-4 w-4" aria-hidden="true" />
              Up one level
            </Link>
          ) : null}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-2 xl:max-h-[calc(100vh-19rem)]">
        {treeNodes.length > 0 ? (
          <div className="grid gap-1">
            {treeNodes.map((node) => (
              <RepositoryTreeNavigationNode
                baseHref={baseHref}
                depth={0}
                expandedPaths={expandedPaths}
                key={node.entry.path}
                node={node}
                onToggle={togglePath}
                selectedPath={selectedPath}
                selectedRef={selectedRef}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#d0d7de] p-4 text-sm text-[#59636e]">This folder is empty.</div>
        )}
      </div>
    </aside>
  );
}

function RepositoryTreeNavigationNode({
  baseHref,
  depth,
  expandedPaths,
  node,
  onToggle,
  selectedPath,
  selectedRef,
}: {
  baseHref: string;
  depth: number;
  expandedPaths: Set<string>;
  node: RepositoryTreeNode;
  onToggle: (path: string) => void;
  selectedPath: string;
  selectedRef: string;
}) {
  const { entry } = node;
  const isSelected = entry.path === selectedPath;
  const isDirectory = entry.kind === "directory";
  const isExpanded = isDirectory && expandedPaths.has(entry.path);
  const hasChildren = node.children.length > 0;
  const paddingLeft = `${0.75 + depth * 0.9}rem`;

  return (
    <div className="grid gap-1">
      <div
        className={`group flex min-w-0 items-center gap-2 rounded-xl py-2 pr-3 transition ${isSelected ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#1f2328]"}`}
        style={{ paddingLeft }}
      >
        {isDirectory ? (
          <button
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${entry.name}`}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-black/5 disabled:cursor-default disabled:hover:bg-transparent"
            disabled={!hasChildren}
            onClick={() => onToggle(entry.path)}
            type="button"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Link
          className="flex min-w-0 flex-1 items-center gap-2"
          href={codeHref(baseHref, entry.path, selectedRef, isDirectory ? "tree" : "blob")}
        >
          <IconForFile active={isSelected} entry={entry} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</span>
        </Link>
      </div>
      {isExpanded && hasChildren ? (
        <div className="grid gap-1">
          {node.children.map((child) => (
            <RepositoryTreeNavigationNode
              baseHref={baseHref}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              key={child.entry.path}
              node={child}
              onToggle={onToggle}
              selectedPath={selectedPath}
              selectedRef={selectedRef}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
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

function selectedPathExpansion(path: string) {
  const segments = path.split("/").filter(Boolean);
  const paths = new Set<string>();
  for (let index = 0; index < segments.length; index += 1) {
    paths.add(segments.slice(0, index + 1).join("/"));
  }
  return paths;
}

function parentDirectoryPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length > 0 ? parts.join("/") : undefined;
}

function codeHref(baseHref: string, path: string | undefined, ref: string, mode: "blob" | "tree") {
  const query = new URLSearchParams({ ref });
  return path ? `${baseHref}/${mode}/${path.split("/").map(encodeURIComponent).join("/")}?${query}` : `${baseHref}?${query}`;
}
