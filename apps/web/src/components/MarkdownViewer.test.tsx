import { describe, expect, it } from "vitest";
import { safeMarkdownHref, sanitizeMarkdownContent } from "./MarkdownViewer";

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

  it("strips raw html from markdown before rendering", () => {
    expect(sanitizeMarkdownContent("Hello <img src=x onerror=alert(1)> <script>alert(1)</script>")).toBe(
      "Hello  alert(1)",
    );
  });

  it("preserves html-looking text inside fenced code blocks", () => {
    expect(sanitizeMarkdownContent("```html\n<img src=x onerror=alert(1)>\n```")).toBe(
      "```html\n<img src=x onerror=alert(1)>\n```",
    );
  });
});
