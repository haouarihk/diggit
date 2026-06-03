import { describe, expect, it } from "vitest";
import { safeMarkdownHref } from "./MarkdownViewer";

describe("MarkdownViewer", () => {
  it("allows safe markdown link targets", () => {
    expect(safeMarkdownHref("https://example.com/repo")).toBe("https://example.com/repo");
    expect(safeMarkdownHref("/alice/repo")).toBe("/alice/repo");
    expect(safeMarkdownHref("#readme")).toBe("#readme");
  });

  it("blocks unsafe markdown link targets", () => {
    expect(safeMarkdownHref("javascript:alert(1)")).toBe("#");
    expect(safeMarkdownHref("data:text/html,hi")).toBe("#");
  });
});
