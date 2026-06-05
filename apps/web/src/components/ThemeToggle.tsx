"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useRef } from "react";

const OPTIONS = [
  { id: "system", label: "System", icon: "◐", description: "Match your device" },
  { id: "light", label: "Light", icon: "☼", description: "Bright interface" },
  { id: "dark", label: "Dark", icon: "☾", description: "Dim interface" },
] as const;

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = OPTIONS.find((option) => option.id === preference) ?? OPTIONS[0];

  function selectTheme(theme: typeof preference) {
    setPreference(theme);
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details className="group relative" ref={detailsRef}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 font-semibold text-[#1f2328] shadow-sm hover:border-[#0969da] hover:text-[#0969da]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#24292f] text-sm text-white">
          {selected.icon}
        </span>
        <span className="hidden sm:inline">{selected.label}</span>
        <span className="text-xs text-[#59636e]">▾</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-[#d0d7de] bg-white shadow-xl">
        <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
          <div className="text-sm font-semibold text-[#1f2328]">Theme</div>
          <div className="text-xs text-[#59636e]">Choose how Diggit looks.</div>
        </div>
        <div className="grid p-1.5">
          {OPTIONS.map((option) => {
            const active = option.id === preference;
            return (
              <button
                className={`grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  active ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#1f2328] hover:bg-[#f6f8fa]"
                }`}
                key={option.id}
                type="button"
                onClick={() => selectTheme(option.id)}
              >
                <span className="grid h-8 w-8 place-items-center rounded-full border border-[#d0d7de] bg-white">
                  {option.icon}
                </span>
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-xs text-[#59636e]">{option.description}</span>
                </span>
                {active ? <span className="font-bold">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
