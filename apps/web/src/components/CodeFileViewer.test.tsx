import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeFileViewer, resolveFileLanguage } from "./CodeFileViewer";

describe("CodeFileViewer", () => {
  it("detects TypeScript files from nested repository paths", () => {
    expect(resolveFileLanguage({ extension: "ts", name: "schema.ts", path: "db/schema.ts" })).toEqual({
      label: "TypeScript",
      language: "typescript",
    });
  });

  it("renders highlighted code without a fixed-height scroll container", async () => {
    const html = renderToStaticMarkup(
      await CodeFileViewer({
        file: {
          content: "export const schema = true;\n",
          extension: "ts",
          name: "schema.ts",
          path: "db/schema.ts",
          size: 28,
        },
      }),
    );

    expect(html).toContain("db/schema.ts");
    expect(html).toContain("TypeScript");
    expect(html).toContain("shiki");
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("max-h-[560px]");
    expect(html).not.toContain("overflow-auto");
  });
});
