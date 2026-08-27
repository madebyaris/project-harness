import { describe, expect, it } from "vitest";
import { assertUnderRoot, parseProjectId, parseSlug } from "../src/parse.ts";
import { parseInstance } from "../src/tidb-zero.ts";

describe("parse", () => {
  it("accepts a uuid project id", () => {
    const id = parseProjectId("11111111-1111-4111-8111-111111111111");
    expect(id).not.toBeNull();
  });

  it("rejects a non-uuid project id", () => {
    expect(parseProjectId("project-a")).toBeNull();
  });

  it("accepts a slug", () => {
    expect(parseSlug("alpha-bot")).toBe("alpha-bot");
  });

  it("rejects an uppercase slug", () => {
    expect(parseSlug("Alpha")).toBeNull();
  });
});

describe("assertUnderRoot", () => {
  it("accepts a path under the root", () => {
    const check = assertUnderRoot("/workspace/alpha", "/workspace/alpha/src/app.ts");
    expect(check).toEqual({ kind: "ok", path: "/workspace/alpha/src/app.ts" });
  });

  it("rejects traversal", () => {
    expect(assertUnderRoot("/workspace/alpha", "/workspace/alpha/../beta/secret")).toEqual({
      kind: "rejected",
      reason: "dotdot",
    });
  });

  it("rejects a sibling root", () => {
    expect(assertUnderRoot("/workspace/alpha", "/workspace/beta/file")).toEqual({
      kind: "rejected",
      reason: "outside_root",
    });
  });

  it("rejects a relative path", () => {
    expect(assertUnderRoot("/workspace/alpha", "src/app.ts")).toEqual({
      kind: "rejected",
      reason: "not_absolute",
    });
  });
});

describe("tidb zero parse", () => {
  it("reads the v1beta1 instance envelope", () => {
    const instance = parseInstance({
      instance: {
        id: "abc",
        connectionString: "mysql://u:p@h:4000/",
        expiresAt: "2026-09-26T00:00:00.000Z",
        connection: { host: "h", port: 4000, username: "u" },
        claimInfo: { claimUrl: "https://tidbcloud.com/tidbs/claim/abc" },
      },
    });
    expect(instance?.id).toBe("abc");
    expect(instance?.claimUrl).toBe("https://tidbcloud.com/tidbs/claim/abc");
  });
});
