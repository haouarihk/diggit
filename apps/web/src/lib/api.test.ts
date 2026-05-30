import { describe, expect, it } from "vitest";
import { repoHref } from "./api";

describe("repoHref", () => {
  it("uses direct owner and repository paths", () => {
    expect(repoHref({ owner_handle: "acme", name: "core" })).toBe("/acme/core");
  });

  it("encodes owner and repository names", () => {
    expect(repoHref({ owner_handle: "alice@git.example.com", name: "core" })).toBe(
      "/alice%40git.example.com/core",
    );
  });
});
