import { isRecord, readString } from "./parse.ts";

const ZERO_URL = "https://zero.tidbapi.com/v1beta1/instances";

export type TidbZeroInstance = {
  id: string;
  connectionString: string;
  claimUrl: string | null;
  expiresAt: string;
  host: string;
  port: number;
  username: string;
};

export async function provisionTidbZero(tag: string): Promise<TidbZeroInstance> {
  const response = await fetch(ZERO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`tidb_zero_http_${response.status}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("tidb_zero_invalid_json");
  }
  const instance = parseInstance(parsed);
  if (instance === null) {
    throw new Error("tidb_zero_unexpected_shape");
  }
  return instance;
}

export function parseInstance(value: unknown): TidbZeroInstance | null {
  if (!isRecord(value)) return null;
  const instance = isRecord(value.instance) ? value.instance : value;
  const id = readString(instance, "id");
  const connectionString = readString(instance, "connectionString");
  const expiresAt = readString(instance, "expiresAt");
  const connection = isRecord(instance.connection) ? instance.connection : null;
  const host = connection === null ? null : readString(connection, "host");
  const username = connection === null ? null : readString(connection, "username");
  const portRaw = connection === null ? null : connection.port;
  const port = typeof portRaw === "number" && Number.isInteger(portRaw) ? portRaw : null;
  const claimInfo = isRecord(instance.claimInfo) ? instance.claimInfo : null;
  const claimUrl = claimInfo === null ? null : readString(claimInfo, "claimUrl");
  if (
    id === null ||
    connectionString === null ||
    expiresAt === null ||
    host === null ||
    username === null ||
    port === null
  ) {
    return null;
  }
  return {
    id,
    connectionString,
    claimUrl,
    expiresAt,
    host,
    port,
    username,
  };
}

export function isExpired(expiresAt: string, nowMs = Date.now()): boolean {
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return true;
  return expires <= nowMs + 60_000;
}
