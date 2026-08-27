import { connect, type ExecuteArgs } from "@tidbcloud/serverless";
import { isRecord } from "./parse.ts";
import {
  databaseName,
  sqlSourceFromEnv,
  withOpenedSql,
  type Sql,
  type SqlSource,
  type SqlValue,
} from "./sql-types.ts";

export { sqlSourceFromEnv, type Sql, type SqlSource, type SqlValue };

type HttpExecutor = {
  execute(
    query: string,
    args?: ExecuteArgs,
    options?: { fullResult: true },
  ): Promise<{ rows: unknown; rowsAffected: number | null }>;
};

type HttpSession = HttpExecutor & {
  begin(): Promise<HttpTx>;
};

type HttpTx = HttpExecutor & {
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
};

export function tidbHttpDatabaseUrl(mysqlUrl: string): string {
  const parsed = new URL(mysqlUrl);
  parsed.port = "";
  parsed.pathname = `/${databaseName(parsed.pathname)}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function recordsFromRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of rows) {
    if (isRecord(item)) out.push(item);
  }
  return out;
}

function executeArgs(params: SqlValue[]): ExecuteArgs {
  return params.length === 0 ? null : params;
}

function wrap(executor: HttpExecutor, session: HttpSession | null): Sql {
  return {
    async one(sql, params = []) {
      const result = await executor.execute(sql, executeArgs(params), {
        fullResult: true,
      });
      return recordsFromRows(result.rows)[0] ?? null;
    },
    async many(sql, params = []) {
      const result = await executor.execute(sql, executeArgs(params), {
        fullResult: true,
      });
      return recordsFromRows(result.rows);
    },
    async run(sql, params = []) {
      const result = await executor.execute(sql, executeArgs(params), {
        fullResult: true,
      });
      return { affectedRows: result.rowsAffected ?? 0 };
    },
    async exec(sql) {
      await executor.execute(sql, null, { fullResult: true });
    },
    async transact(fn) {
      if (session === null) {
        throw new Error("nested_transaction");
      }
      const tx = await session.begin();
      try {
        const value = await fn(wrap(tx, null));
        await tx.commit();
        return value;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    },
    async close() {},
  };
}

export async function openSql(source: SqlSource): Promise<Sql> {
  if (source.kind === "hyperdrive") {
    throw new Error("hyperdrive_unsupported_tidb_zero");
  }
  const config: { url: string; fullResult: true } = {
    url: tidbHttpDatabaseUrl(source.url),
    fullResult: true,
  };
  const conn = connect(config);
  return wrap(conn, conn);
}

export async function withSql<T>(
  source: SqlSource,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  return withOpenedSql(await openSql(source), fn);
}
