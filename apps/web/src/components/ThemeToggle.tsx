"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1.5 font-semibold text-[#1f2328]">
      <span className="sr-only">Theme</span>
      <span aria-hidden="true">Theme</span>
      <select
        aria-label="Theme"
        className="cursor-pointer bg-transparent text-[#1f2328] outline-none"
        value={preference}
        onChange={(event) => setPreference(event.target.value as "light" | "dark" | "system")}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
