import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "../src/migrate.ts";
import { resolveConnectionString } from "../src/local-instance.ts";
import { openSql, type Sql } from "../src/sql.ts";

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let shared: Sql | null = null;

export async function testSql(): Promise<Sql> {
  if (shared !== null) return shared;
  const instance = await resolveConnectionString({
    provisionIfMissing: true,
    tag: "project-harness-test",
  });
  shared = await openSql({ kind: "url", url: instance.connectionString });
  const body = await readFile(join(workerRoot, "migrations", "0001_init.sql"), "utf8");
  await applyMigrations(shared, [{ filename: "0001_init.sql", body }]);
  return shared;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export const TEST_TOKEN = "test-token-do-not-use-in-prod";

