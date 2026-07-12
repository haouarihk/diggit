import type { CSSProperties } from "react";
import type { IssueLabel } from "@/lib/api";

export function RepositoryLabelBadges({ labels }: { labels: IssueLabel[] }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span className="rounded-full border px-2 py-0.5 text-xs font-semibold" key={label.id} style={labelBadgeStyle(label.color)}>
          {label.name}
        </span>
      ))}
    </div>
  );
}

function labelBadgeStyle(color: string): CSSProperties {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return {
      backgroundColor: "#f6f8fa",
      borderColor: "#d0d7de",
      color: "#59636e",
    };
  }

  return {
    backgroundColor: `${normalized}1a`,
    borderColor: `${normalized}55`,
    color: normalized,
  };
}

function normalizeHexColor(color: string) {
  const value = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return null;
}
