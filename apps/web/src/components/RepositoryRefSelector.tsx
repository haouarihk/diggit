"use client";

import { Check, ChevronDown, GitBranch, Search, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { RepositoryBranch, RepositoryTag } from "@/lib/api";

type RefTab = "branches" | "tags";

type RefOption = {
  isDefault?: boolean;
  kind: RefTab;
  name: string;
};

type RepositoryRefSelectorProps = {
  baseHref: string;
  branches: RepositoryBranch[];
  selectedRef: string;
  tags: RepositoryTag[];
};

export function RepositoryRefSelector({ baseHref, branches, selectedRef, tags }: RepositoryRefSelectorProps) {
  const branchOptions = useMemo(
    () =>
      branches.map(
        (branch): RefOption => ({
          isDefault: branch.is_default,
          kind: "branches",
          name: branch.name,
        }),
      ),
    [branches],
  );
  const tagOptions = useMemo(
    () =>
      tags.map(
        (tag): RefOption => ({
          kind: "tags",
          name: tag.name,
        }),
      ),
    [tags],
  );
  const selectedBranch = branchOptions.find((branch) => branch.name === selectedRef);
  const selectedTag = tagOptions.find((tag) => tag.name === selectedRef);
  const selectedKind: RefTab = selectedTag && !selectedBranch ? "tags" : "branches";
  const selectedOption = selectedBranch ?? selectedTag;
  const [activeTab, setActiveTab] = useState<RefTab>(selectedKind);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const activeOptions = activeTab === "branches" ? branchOptions : tagOptions;
  const filteredOptions = useMemo(
    () => (normalizedQuery ? activeOptions.filter((option) => option.name.toLowerCase().includes(normalizedQuery)) : activeOptions),
    [activeOptions, normalizedQuery],
  );

  if (branchOptions.length === 0 && tagOptions.length === 0) {
    return null;
  }

  return (
    <details className="relative">
      <summary className="flex max-w-full cursor-pointer list-none items-center gap-2 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-sm font-semibold">
        {selectedKind === "tags" ? <Tag className="h-4 w-4 shrink-0 text-[#59636e]" aria-hidden="true" /> : <GitBranch className="h-4 w-4 shrink-0 text-[#59636e]" aria-hidden="true" />}
        <span className="max-w-44 truncate">{selectedRef}</span>
        {selectedOption?.isDefault ? <DefaultBranchBadge /> : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-[#59636e]" aria-hidden="true" />
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-80 overflow-hidden rounded-md border border-[#d0d7de] bg-white shadow-lg">
        <div className="border-b border-[#d8dee4] px-3 py-2">
          <div className="text-sm font-semibold text-[#1f2328]">Switch branches/tags</div>
        </div>
        <div className="grid grid-cols-2 border-b border-[#d8dee4] p-2" role="tablist" aria-label="Repository refs">
          <RefTabButton active={activeTab === "branches"} count={branchOptions.length} label="Branches" onClick={() => setActiveTab("branches")} />
          <RefTabButton active={activeTab === "tags"} count={tagOptions.length} label="Tags" onClick={() => setActiveTab("tags")} />
        </div>
        <div className="border-b border-[#d8dee4] p-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#59636e]" aria-hidden="true" />
            <input
              aria-label={`Search ${activeTab}`}
              className="w-full rounded-md border border-[#d0d7de] bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20"
              placeholder={activeTab === "branches" ? "Search branches" : "Search tags"}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const active = option.name === selectedRef && option.kind === selectedKind;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md px-2 py-2 text-sm ${
                    active ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#1f2328] hover:bg-[#f6f8fa]"
                  }`}
                  href={codeHref(baseHref, option.name)}
                  key={`${option.kind}:${option.name}`}
                >
                  <span className="text-[#0969da]">{active ? <Check className="h-4 w-4" aria-hidden="true" /> : null}</span>
                  <span className="min-w-0 truncate">{option.name}</span>
                  {option.isDefault ? <DefaultBranchBadge /> : null}
                </Link>
              );
            })
          ) : (
            <div className="px-3 py-6 text-center text-sm text-[#59636e]">No {activeTab} found.</div>
          )}
        </div>
      </div>
    </details>
  );
}

function RefTabButton({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
        active ? "bg-[#0969da] text-white" : "text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#1f2328]"
      }`}
      role="tab"
      type="button"
      onClick={onClick}
    >
      {label} <span className={active ? "text-white/80" : "text-[#59636e]"}>{count}</span>
    </button>
  );
}

function DefaultBranchBadge() {
  return <span className="shrink-0 rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2 py-0.5 text-[11px] font-semibold text-[#59636e]">Default</span>;
}

function codeHref(baseHref: string, ref: string) {
  const query = new URLSearchParams({ ref });
  return `${baseHref}?${query}`;
}
