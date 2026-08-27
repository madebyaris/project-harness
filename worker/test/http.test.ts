import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import { STORE_KIND } from "../src/domain.ts";
import { resolveConnectionString } from "../src/local-instance.ts";
import { TEST_TOKEN, testSql, uniqueSlug } from "./helpers.ts";

const ctx = {
  waitUntil(_promise: Promise<unknown>) {},
};

async function env() {
  await testSql();
  const instance = await resolveConnectionString({
    provisionIfMissing: true,
    tag: "project-harness-test",
  });
  return {
    MCP_TOKEN: TEST_TOKEN,
    TIDB_CONNECTION_STRING: instance.connectionString,
  };
}

function bearerHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers({ Authorization: `Bearer ${TEST_TOKEN}`, ...extra });
  return headers;
}

async function parseRpc(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (type.includes("text/event-stream")) {
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line.length > 0 && line !== "[DONE]");
    const last = dataLines.at(-1);
    if (last === undefined) {
      throw new Error(`empty sse: ${text}`);
    }
    return JSON.parse(last);
  }
  return JSON.parse(text);
}

async function mcpRpc(connection: Awaited<ReturnType<typeof env>>, body: unknown): Promise<unknown> {
  const response = await worker.fetch(
    new Request("https://harness.test/mcp", {
      method: "POST",
      headers: bearerHeaders({
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      }),
      body: JSON.stringify(body),
    }),
    connection,
    ctx,
  );
  expect(response.status, await response.clone().text()).toBeLessThan(500);
  return parseRpc(response);
}

describe("worker http", () => {
  it("serves healthz without auth", async () => {
    const response = await worker.fetch(
      new Request("https://harness.test/healthz"),
      { MCP_TOKEN: TEST_TOKEN },
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects mcp without a bearer token", async () => {
    const response = await worker.fetch(
      new Request("https://harness.test/mcp", { method: "POST" }),
      { MCP_TOKEN: TEST_TOKEN },
      ctx,
    );
    expect(response.status).toBe(401);
  });

  it("rejects backup without a bearer token", async () => {
    const response = await worker.fetch(
      new Request("https://harness.test/backup"),
      { MCP_TOKEN: TEST_TOKEN },
      ctx,
    );
    expect(response.status).toBe(401);
  });

  it("downloads a sql backup when authenticated", async () => {
    const connection = await env();
    const response = await worker.fetch(
      new Request("https://harness.test/backup", {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      }),
      connection,
      ctx,
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("project-harness-backup-v1");
    expect(response.headers.get("content-disposition")).toMatch(/project-harness-.*\.sql/);
  });
});

describe("mcp protocol", () => {
  it("initializes, lists tools, pings, and runs a project flow", async () => {
    const connection = await env();
    const initialized = await mcpRpc(connection, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "project-harness-test", version: "0.0.1" },
      },
    });
    expect(initialized).toMatchObject({ jsonrpc: "2.0", id: 1 });

    const listed = await mcpRpc(connection, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const listedRecord = listed as { result?: { tools?: { name: string }[] } };
    const names = (listedRecord.result?.tools ?? []).map((tool) => tool.name);
    expect(names).toContain("harness_ping");
    expect(names).toContain("create_project");
    expect(names).toContain("export_backup");

    const ping = await mcpRpc(connection, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "harness_ping", arguments: {} },
    });
    const pingRecord = ping as { result?: { content?: { text: string }[] } };
    const pingText = pingRecord.result?.content?.[0]?.text ?? "";
    expect(pingText).toContain(STORE_KIND);

    const slug = uniqueSlug("mcp");
    const created = await mcpRpc(connection, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "create_project",
        arguments: { slug, title: "MCP flow", rootPath: "/workspace/mcp" },
      },
    });
    const createdRecord = created as { result?: { content?: { text: string }[] } };
    const createdText = createdRecord.result?.content?.[0]?.text ?? "";
    const createdJson = JSON.parse(createdText) as {
      ok: boolean;
      value?: { id: string };
    };
    expect(createdJson.ok).toBe(true);
    expect(createdJson.value?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
