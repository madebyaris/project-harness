import { BACKUP_FORMAT } from "./domain.ts";
import { isRecord, readString } from "./parse.ts";
import type { Sql, SqlValue } from "./sql-types.ts";
import { splitStatements } from "./migrate.ts";

export const BACKUP_TABLES = [
  "projects",
  "context_entries",
  "runs",
  "tasks",
  "artifacts",
  "decisions",
  "events",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  exportedAtMs: number;
  tables: Record<BackupTable, Record<string, unknown>[]>;
};

const DELETE_ORDER: BackupTable[] = [
  "events",
  "decisions",
  "artifacts",
  "tasks",
  "context_entries",
  "runs",
  "projects",
];

function sqlLiteral(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }
  throw new Error("unserializable_backup_value");
}

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function insertStatement(table: string, row: Record<string, unknown>): string {
  const keys = Object.keys(row);
  const columns = keys.map(quoteIdent).join(", ");
  const values = keys.map((key) => sqlLiteral(row[key] ?? null)).join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${values});`;
}

export async function exportBackup(sql: Sql): Promise<BackupDocument> {
  const tables = {} as Record<BackupTable, Record<string, unknown>[]>;
  for (const table of BACKUP_TABLES) {
    tables[table] = await sql.many(`SELECT * FROM ${quoteIdent(table)}`);
  }
  return {
    format: BACKUP_FORMAT,
    exportedAtMs: Date.now(),
    tables,
  };
}

export function backupToSql(document: BackupDocument): string {
  const lines: string[] = [
    `-- ${BACKUP_FORMAT}`,
    `-- exported_at_ms=${document.exportedAtMs}`,
    "SET FOREIGN_KEY_CHECKS=0;",
  ];
  for (const table of DELETE_ORDER) {
    lines.push(`DELETE FROM ${quoteIdent(table)};`);
  }
  for (const table of BACKUP_TABLES) {
    for (const row of document.tables[table]) {
      lines.push(insertStatement(table, row));
    }
  }
  lines.push("SET FOREIGN_KEY_CHECKS=1;");
  lines.push("");
  return lines.join("\n");
}

export function parseBackupJson(text: string): BackupDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const format = readString(parsed, "format");
  const exportedAtMs = parsed.exportedAtMs;
  if (format !== BACKUP_FORMAT) return null;
  if (typeof exportedAtMs !== "number" || !Number.isInteger(exportedAtMs)) return null;
  if (!isRecord(parsed.tables)) return null;
  const tables = {} as Record<BackupTable, Record<string, unknown>[]>;
  for (const table of BACKUP_TABLES) {
    const rows = parsed.tables[table];
    if (!Array.isArray(rows)) return null;
    const copied: Record<string, unknown>[] = [];
    for (const row of rows) {
      if (!isRecord(row)) return null;
      copied.push(row);
    }
    tables[table] = copied;
  }
  return { format: BACKUP_FORMAT, exportedAtMs, tables };
}

export async function restoreBackup(sql: Sql, document: BackupDocument): Promise<void> {
  await sql.transact(async (tx) => {
    await tx.exec("SET FOREIGN_KEY_CHECKS=0");
    for (const table of DELETE_ORDER) {
      await tx.run(`DELETE FROM ${quoteIdent(table)}`);
    }
    for (const table of BACKUP_TABLES) {
      for (const row of document.tables[table]) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;
        const columns = keys.map(quoteIdent).join(", ");
        const placeholders = keys.map(() => "?").join(", ");
        const values: SqlValue[] = keys.map((key) => {
          const value = row[key];
          if (value === null || typeof value === "string" || typeof value === "number") {
            return value;
          }
          if (typeof value === "bigint") return Number(value);
          return JSON.stringify(value);
        });
        await tx.run(
          `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${placeholders})`,
          values,
        );
      }
    }
    await tx.exec("SET FOREIGN_KEY_CHECKS=1");
  });
}

export async function restoreBackupSql(sql: Sql, dump: string): Promise<void> {
  if (!dump.includes(BACKUP_FORMAT)) {
    throw new Error("unknown_backup_format");
  }
  for (const statement of splitStatements(dump)) {
    await sql.run(statement);
  }
}

export function backupFilename(exportedAtMs: number, ext: "sql" | "json"): string {
  const date = new Date(exportedAtMs).toISOString().slice(0, 10);
  return `project-harness-${date}.${ext}`;
}
