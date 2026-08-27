import { DEFAULT_DATABASE } from "./domain.ts";
import type { HyperdriveBinding } from "./env.ts";
import { isRecord } from "./parse.ts";

export type SqlValue = string | number | null;

export type Sql = {
  one(sql: string, params?: SqlValue[]): Promise<Record<string, unknown> | null>;
  many(sql: string, params?: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params?: SqlValue[]): Promise<{ affectedRows: number }>;
  exec(sql: string): Promise<void>;
  transact<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export type SqlSource =
  | { kind: "url"; url: string }
  | { kind: "hyperdrive"; hyperdrive: HyperdriveBinding };

const DUPLICATE_ERRNO = 1062;

export function isDuplicateKey(error: unknown): boolean {
  if (isRecord(error) && error.errno === DUPLICATE_ERRNO) {
    return true;
  }
  return error instanceof Error && /Error 1062\b/.test(error.message);
}

export function databaseName(raw: string): string {
  const trimmed = raw.replace(/^\//, "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_DATABASE;
}

export function sqlSourceFromEnv(env: {
  HYPERDRIVE?: HyperdriveBinding;
  TIDB_CONNECTION_STRING?: string;
}): SqlSource {
  if (env.HYPERDRIVE !== undefined) {
    return { kind: "hyperdrive", hyperdrive: env.HYPERDRIVE };
  }
  const url = env.TIDB_CONNECTION_STRING;
  if (url === undefined || url.length === 0) {
    throw new Error("missing_tidb_connection");
  }
  return { kind: "url", url };
}

export async function withOpenedSql<T>(
  sql: Sql,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  try {
    return await fn(sql);
  } finally {
    await sql.close();
  }
}
