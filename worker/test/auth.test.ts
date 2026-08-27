import { describe, expect, it } from "vitest";
import { authenticate } from "../src/auth.ts";

const TOKEN = "test-token-do-not-use-in-prod";

function request(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("Authorization", header);
  return new Request("https://example.test/mcp", { headers });
}

describe("authenticate", () => {
  it("accepts the matching bearer token", async () => {
    const result = await authenticate(request(`Bearer ${TOKEN}`), TOKEN);
    expect(result).toEqual({ kind: "ok" });
  });

  it("denies a missing header", async () => {
    const result = await authenticate(request(null), TOKEN);
    expect(result).toEqual({ kind: "denied" });
  });

  it("denies a wrong token of equal length", async () => {
    const result = await authenticate(request(`Bearer ${"x".repeat(TOKEN.length)}`), TOKEN);
    expect(result).toEqual({ kind: "denied" });
  });

  it("denies a different-length token", async () => {
    const result = await authenticate(request("Bearer no"), TOKEN);
    expect(result).toEqual({ kind: "denied" });
  });

  it("denies an empty expected token", async () => {
    const result = await authenticate(request(`Bearer ${TOKEN}`), "");
    expect(result).toEqual({ kind: "denied" });
  });
});
