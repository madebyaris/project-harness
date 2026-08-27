import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticate, unauthorized } from "./auth.ts";
import {
  backupFilename,
  backupToSql,
  exportBackup,
} from "./backup.ts";
import type { Env } from "./env.ts";
import { emit } from "./log.ts";
import { createHarnessServer } from "./mcp.ts";
import { sqlSourceFromEnv, withSql } from "./sql-http.ts";

export default {
  async fetch(request: Request, env: Env, _ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/readyz" && request.method === "GET") {
      try {
        await withSql(sqlSourceFromEnv(env), async (db) => {
          await db.one("SELECT 1 AS ok");
        });
        return Response.json({ ok: true, store: "tidb-cloud-zero" });
      } catch (error) {
        emit("readyz_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        return Response.json({ ok: false, store: "tidb-cloud-zero" }, { status: 503 });
      }
    }
    if (url.pathname === "/backup" && request.method === "GET") {
      const auth = await authenticate(request, env.MCP_TOKEN);
      if (auth.kind === "denied") {
        return unauthorized();
      }
      const format = url.searchParams.get("format") === "json" ? "json" : "sql";
      const document = await withSql(sqlSourceFromEnv(env), (db) => exportBackup(db));
      const filename = backupFilename(document.exportedAtMs, format);
      if (format === "json") {
        return new Response(JSON.stringify(document, null, 2), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="${filename}"`,
          },
        });
      }
      return new Response(backupToSql(document), {
        headers: {
          "content-type": "application/sql; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    if (url.pathname === "/mcp") {
      const auth = await authenticate(request, env.MCP_TOKEN);
      if (auth.kind === "denied") {
        return unauthorized();
      }
      const mcp = createMcpHandler(() => createHarnessServer(env), {
        legacy: "stateless",
        onerror: (error) => {
          console.error(JSON.stringify({ event: "mcp_error", message: error.message }));
        },
      });
      return mcp.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
