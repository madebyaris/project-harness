import { createConnection, type Connection } from "mysql2/promise";
import { isRecord } from "./parse.ts";
import {
  databaseName,
  isDuplicateKey,
  sqlSourceFromEnv,
  withOpenedSql,
  type Sql,
  type SqlSource,
  type SqlValue,
} from "./sql-types.ts";

export type { Sql, SqlSource, SqlValue };
export { isDuplicateKey, sqlSourceFromEnv };

function rowFromUnknown(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function rowsFromResult(result: unknown): Record<string, unknown>[] {
  if (!Array.isArray(result)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const item of result) {
    const row = rowFromUnknown(item);
    if (row === null) continue;
    rows.push(row);
  }
  return rows;
}

function affectedFromResult(result: unknown): number {
  if (!isRecord(result)) return 0;
  const value = result.affectedRows;
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function wrap(connection: Connection, inTx: boolean): Sql {
  return {
    async one(sql, params = []) {
      const [result] = await connection.execute(sql, params);
      const rows = rowsFromResult(result);
      return rows[0] ?? null;
    },
    async many(sql, params = []) {
      const [result] = await connection.execute(sql, params);
      return rowsFromResult(result);
    },
    async run(sql, params = []) {
      const [result] = await connection.execute(sql, params);
      return { affectedRows: affectedFromResult(result) };
    },
    async exec(sql) {
      await connection.query(sql);
    },
    async transact(fn) {
      if (inTx) {
        throw new Error("nested_transaction");
      }
      await connection.beginTransaction();
      try {
        const value = await fn(wrap(connection, true));
        await connection.commit();
        return value;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    },
    async close() {
      await connection.end();
    },
  };
}

export async function openSql(source: SqlSource): Promise<Sql> {
  if (source.kind === "hyperdrive") {
    const database = databaseName(source.hyperdrive.database);
    const connection = await createConnection({
      host: source.hyperdrive.host,
      user: source.hyperdrive.user,
      password: source.hyperdrive.password,
      database,
      port: source.hyperdrive.port,
      ssl: { minVersion: "TLSv1.2" },
      disableEval: true,
    });
    return wrap(connection, false);
  }

  const parsed = new URL(source.url);
  const database = databaseName(parsed.pathname);
  const base = {
    host: parsed.hostname,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    port: parsed.port === "" ? 4000 : Number(parsed.port),
    ssl: { minVersion: "TLSv1.2" as const },
    disableEval: true,
  };
  const bootstrap = await createConnection(base);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
    );
  } finally {
    await bootstrap.end();
  }

  const connection = await createConnection({
    ...base,
    database,
  });
  return wrap(connection, false);
}

export async function withSql<T>(
  source: SqlSource,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  return withOpenedSql(await openSql(source), fn);
}
