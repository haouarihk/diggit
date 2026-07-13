import { component$ } from "@builder.io/qwik";

import type { IssueLabel } from "~/lib/api";

export const RepositoryLabelBadges = component$(
  ({ labels }: { labels: IssueLabel[] }) => {
    if (labels.length === 0) {
      return null;
    }

    return (
      <div class="repository-label-badges">
        {labels.map((label) => (
          <span
            key={label.id}
            class="repository-label-badges__badge"
            style={labelBadgeStyle(label.color)}
          >
            {label.name}
          </span>
        ))}
      </div>
    );
  },
);

function labelBadgeStyle(color: string) {
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
