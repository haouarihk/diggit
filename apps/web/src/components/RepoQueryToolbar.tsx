"use client";

import { ChevronDown, Filter, Search, Tag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type RepoToolbarMenuItem = {
  active?: boolean;
  color?: string;
  description?: string;
  href: string;
  label: string;
};

export type RepoToolbarMenu = {
  count?: number;
  emptyLabel?: string;
  icon?: "filter" | "tag";
  items: RepoToolbarMenuItem[];
  label: string;
};

type RepoQueryToolbarProps = {
  action: ReactNode;
  description: string;
  filterMenu: RepoToolbarMenu;
  formAction: string;
  hiddenFields?: Array<{ name: string; value: string }>;
  menus?: RepoToolbarMenu[];
  placeholder: string;
  query: string;
  title: string;
  total: number;
};

export function RepoQueryToolbar({
  action,
  description,
  filterMenu,
  formAction,
  hiddenFields = [],
  menus = [],
  placeholder,
  query,
  title,
  total,
}: RepoQueryToolbarProps) {
  return (
    <div className="grid gap-4 border-b border-[#d8dee4] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            <span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-xs font-semibold text-[#1f2328]">{total}</span>
          </div>
          <p className="text-sm text-[#59636e]">{description}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <form action={formAction} className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-[#d0d7de] bg-white shadow-sm">
          {hiddenFields.map((field) => (
            <input key={field.name} name={field.name} type="hidden" value={field.value} />
          ))}
          <ToolbarMenu compact menu={filterMenu} />
          <label className="flex min-w-0 flex-1 items-center gap-2 border-l border-[#d8dee4] px-3">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#59636e]" />
            <input
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#1f2328] outline-none placeholder:text-[#59636e]"
              defaultValue={query}
              name="q"
              placeholder={placeholder}
            />
          </label>
          <button
            aria-label={`Search ${title.toLowerCase()}`}
            className="border-l border-[#d8dee4] px-3 text-[#59636e] transition hover:bg-[#f6f8fa] hover:text-[#1f2328]"
            type="submit"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>

        {menus.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {menus.map((menu) => (
              <ToolbarMenu key={menu.label} menu={menu} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarMenu({ compact = false, menu }: { compact?: boolean; menu: RepoToolbarMenu }) {
  const Icon = menu.icon === "tag" ? Tag : Filter;

  return (
    <details className="relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 whitespace-nowrap font-semibold text-[#1f2328] transition hover:bg-[#f6f8fa] ${
          compact ? "h-full px-3 text-sm" : "rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm"
        }`}
      >
        <Icon aria-hidden="true" className="h-4 w-4 text-[#59636e]" />
        <span>{menu.label}</span>
        {typeof menu.count === "number" ? (
          <span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-xs text-[#1f2328]">{menu.count}</span>
        ) : null}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-[#59636e]" />
      </summary>

      <div className="absolute left-0 top-full z-20 mt-2 grid min-w-72 gap-1 rounded-md border border-[#d0d7de] bg-white p-1.5 shadow-lg">
        {menu.items.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[#59636e]">{menu.emptyLabel ?? "No options available."}</p>
        ) : (
          menu.items.map((item) => (
            <Link
              className={`grid gap-0.5 rounded-md px-3 py-2 text-sm transition ${
                item.active ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#1f2328] hover:bg-[#f6f8fa]"
              }`}
              href={item.href}
              key={item.href}
            >
              <span className="flex items-center gap-2 font-medium">
                {item.color ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /> : null}
                <span>{item.label}</span>
              </span>
              {item.description ? <span className="text-xs text-[#59636e]">{item.description}</span> : null}
            </Link>
          ))
        )}
      </div>
    </details>
  );
}
