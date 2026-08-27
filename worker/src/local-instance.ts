import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExpired, parseInstance, provisionTidbZero } from "./tidb-zero.ts";

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(workerRoot, "..");
export const CACHE_PATH = join(repoRoot, ".tidb-zero.json");
export const DEV_VARS_PATH = join(workerRoot, ".dev.vars");

export async function loadCachedInstance() {
  try {
    return parseInstance(JSON.parse(await readFile(CACHE_PATH, "utf8")));
  } catch {
    return null;
  }
}

export async function persistInstance(instance: {
  id: string;
  connectionString: string;
  claimUrl: string | null;
  expiresAt: string;
  host: string;
  port: number;
  username: string;
}): Promise<void> {
  await writeFile(
    CACHE_PATH,
    `${JSON.stringify(
      {
        instance: {
          id: instance.id,
          connectionString: instance.connectionString,
          claimInfo: instance.claimUrl === null ? {} : { claimUrl: instance.claimUrl },
          expiresAt: instance.expiresAt,
          connection: {
            host: instance.host,
            port: instance.port,
            username: instance.username,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  const token = process.env.MCP_TOKEN ?? "test-token-do-not-use-in-prod";
  await writeFile(
    DEV_VARS_PATH,
    `MCP_TOKEN=${token}\nTIDB_CONNECTION_STRING=${instance.connectionString}\n`,
  );
}

export async function resolveConnectionString(options: {
  provisionIfMissing: boolean;
  tag: string;
}): Promise<{
  id: string;
  connectionString: string;
  claimUrl: string | null;
  expiresAt: string;
}> {
  const fromEnv = process.env.TIDB_CONNECTION_STRING;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    const cached = await loadCachedInstance();
    return {
      id: cached?.id ?? "env",
      connectionString: fromEnv,
      claimUrl: cached?.claimUrl ?? null,
      expiresAt: cached?.expiresAt ?? "unknown",
    };
  }
  const cached = await loadCachedInstance();
  if (cached !== null && !isExpired(cached.expiresAt)) {
    return cached;
  }
  if (!options.provisionIfMissing) {
    throw new Error("missing_tidb_connection_string");
  }
  const instance = await provisionTidbZero(options.tag);
  await persistInstance(instance);
  return instance;
}
