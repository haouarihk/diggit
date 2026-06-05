import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeDiff } from "./CodeDiff";

describe("CodeDiff", () => {
  it("renders additions, deletions, and context lines", () => {
    const html = renderToStaticMarkup(
      <CodeDiff
        files={[
          {
            old_path: "src/app.ts",
            new_path: "src/app.ts",
            status: "modified",
            additions: 1,
            deletions: 1,
            hunks: [
              {
                header: "@@ -1,2 +1,2 @@",
                lines: [
                  { kind: "context", old_line: 1, new_line: 1, content: "const app = true;" },
                  { kind: "deletion", old_line: 2, new_line: null, content: "console.log(app);" },
                  { kind: "addition", old_line: null, new_line: 2, content: "console.info(app);" },
                ],
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("src/app.ts");
    expect(html).toContain("+1");
    expect(html).toContain("-1");
    expect(html).toContain("console.info(app);");
    expect(html).toContain("console.log(app);");
  });

  it("moves the focused file to the top without filtering other files", () => {
    const html = renderToStaticMarkup(
      <CodeDiff
        focusPath="src/feature/app.ts"
        files={[
          {
            old_path: "README.md",
            new_path: "README.md",
            status: "modified",
            additions: 1,
            deletions: 0,
            hunks: [{ header: "@@ -1 +1 @@", lines: [{ kind: "addition", old_line: null, new_line: 1, content: "docs" }] }],
          },
          {
            old_path: "src/feature/app.ts",
            new_path: "src/feature/app.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            hunks: [{ header: "@@ -1 +1 @@", lines: [{ kind: "addition", old_line: null, new_line: 1, content: "code" }] }],
          },
        ]}
      />,
    );

    expect(html.indexOf("src/feature/app.ts")).toBeLessThan(html.indexOf("README.md"));
    expect(html).toContain("README.md");
  });
});
