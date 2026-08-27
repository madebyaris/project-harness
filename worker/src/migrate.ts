import type { Sql } from "./sql-types.ts";

export type MigrationFile = {
  filename: string;
  body: string;
};

export function splitStatements(body: string): string[] {
  const statements: string[] = [];
  let current = "";
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("--") || line.length === 0) {
      continue;
    }
    current = current.length === 0 ? line : `${current} ${line}`;
    if (current.endsWith(";")) {
      statements.push(current.slice(0, -1).trim());
      current = "";
    }
  }
  if (current.length > 0) {
    statements.push(current);
  }
  return statements.filter((statement) => statement.length > 0);
}

export async function applyMigrations(sql: Sql, files: MigrationFile[]): Promise<void> {
  await sql.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at_ms BIGINT NOT NULL
    )
  `);
  for (const file of files) {
    const existing = await sql.one(
      "SELECT filename FROM schema_migrations WHERE filename = ?",
      [file.filename],
    );
    if (existing !== null) continue;
    await sql.transact(async (tx) => {
      for (const statement of splitStatements(file.body)) {
        await tx.run(statement);
      }
      await tx.run(
        "INSERT INTO schema_migrations (filename, applied_at_ms) VALUES (?, ?)",
        [file.filename, Date.now()],
      );
    });
  }
}
