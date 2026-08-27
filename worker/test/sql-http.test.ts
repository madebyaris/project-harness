import { describe, expect, it } from "vitest";
import { resolveConnectionString } from "../src/local-instance.ts";
import { openSql, tidbHttpDatabaseUrl } from "../src/sql-http.ts";
import { isDuplicateKey } from "../src/sql-types.ts";
import { testSql } from "./helpers.ts";

describe("tidb http url", () => {
  it("strips the mysql port and sets the database path", () => {
    expect(tidbHttpDatabaseUrl("mysql://u:p@gateway.example:4000/")).toBe(
      "mysql://u:p@gateway.example/project_harness",
    );
  });
});

describe("isDuplicateKey", () => {
  it("matches mysql2 errno 1062", () => {
    expect(isDuplicateKey({ errno: 1062 })).toBe(true);
  });

  it("matches the TiDB HTTP driver message", () => {
    expect(
      isDuplicateKey(
        new Error("Execute SQL fail: Error 1062 (23000): Duplicate entry 'x' for key 'PRIMARY'"),
      ),
    ).toBe(true);
  });
});

describe("tidb http adapter", () => {
  it("pings, transacts, and reports duplicate keys", async () => {
    await testSql();
    const instance = await resolveConnectionString({
      provisionIfMissing: true,
      tag: "project-harness-test",
    });
    const sql = await openSql({ kind: "url", url: instance.connectionString });
    try {
      const ping = await sql.one("SELECT 1 AS ok");
      expect(ping).not.toBeNull();
      expect(ping?.ok === 1 || ping?.ok === "1").toBe(true);

      const filename = `http-adapter-${crypto.randomUUID()}`;
      await sql.transact(async (tx) => {
        await tx.run(
          "INSERT INTO schema_migrations (filename, applied_at_ms) VALUES (?, ?)",
          [filename, Date.now()],
        );
      });

      let duplicate: unknown = null;
      try {
        await sql.run(
          "INSERT INTO schema_migrations (filename, applied_at_ms) VALUES (?, ?)",
          [filename, Date.now()],
        );
      } catch (error) {
        duplicate = error;
      }
      expect(isDuplicateKey(duplicate)).toBe(true);

      await sql.run("DELETE FROM schema_migrations WHERE filename = ?", [filename]);
    } finally {
      await sql.close();
    }
  });
});
