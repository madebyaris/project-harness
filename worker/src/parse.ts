import type {
  ArtifactId,
  ContextEntryId,
  ContextKind,
  DecisionBucket,
  DecisionId,
  EventId,
  ProjectId,
  RunId,
  TaskId,
} from "./domain.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTEXT_KINDS = [
  "fact",
  "constraint",
  "artifact_ref",
  "decision",
  "canary",
] as const satisfies readonly ContextKind[];
const DECISION_BUCKETS = [
  "act_on",
  "consider",
  "noted",
  "dismissed",
] as const satisfies readonly DecisionBucket[];

export type PathCheck =
  | { kind: "ok"; path: string }
  | { kind: "rejected"; reason: string };

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function parseProjectId(value: string): ProjectId | null {
  return isUuid(value) ? (value as ProjectId) : null;
}

export function parseRunId(value: string): RunId | null {
  return isUuid(value) ? (value as RunId) : null;
}

export function parseTaskId(value: string): TaskId | null {
  return isUuid(value) ? (value as TaskId) : null;
}

export function parseContextEntryId(value: string): ContextEntryId | null {
  return isUuid(value) ? (value as ContextEntryId) : null;
}

export function parseArtifactId(value: string): ArtifactId | null {
  return isUuid(value) ? (value as ArtifactId) : null;
}

export function parseDecisionId(value: string): DecisionId | null {
  return isUuid(value) ? (value as DecisionId) : null;
}

export function parseEventId(value: string): EventId | null {
  return isUuid(value) ? (value as EventId) : null;
}

export function parseSlug(value: string): string | null {
  if (value.length < 1 || value.length > 64) return null;
  return SLUG_RE.test(value) ? value : null;
}

export function parseContextKind(value: string): ContextKind | null {
  return (CONTEXT_KINDS as readonly string[]).includes(value)
    ? (value as ContextKind)
    : null;
}

export function parseDecisionBucket(value: string): DecisionBucket | null {
  return (DECISION_BUCKETS as readonly string[]).includes(value)
    ? (value as DecisionBucket)
    : null;
}

export function parseNonEmpty(value: string, max: number): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) return null;
  return trimmed;
}

export function parsePositiveInt(
  value: number,
  min: number,
  max: number,
): number | null {
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

export function assertUnderRoot(rootPath: string, candidate: string): PathCheck {
  if (candidate.includes("\0")) {
    return { kind: "rejected", reason: "nul" };
  }
  if (candidate.includes("..")) {
    return { kind: "rejected", reason: "dotdot" };
  }
  if (!candidate.startsWith("/")) {
    return { kind: "rejected", reason: "not_absolute" };
  }
  const root = rootPath.endsWith("/") ? rootPath.slice(0, -1) : rootPath;
  if (candidate === root || candidate.startsWith(`${root}/`)) {
    return { kind: "ok", path: candidate };
  }
  return { kind: "rejected", reason: "outside_root" };
}

export function parseRootPath(value: string | null | undefined): PathCheck | { kind: "empty" } {
  if (value === null || value === undefined || value.trim() === "") {
    return { kind: "empty" };
  }
  const trimmed = value.trim();
  if (trimmed.includes("\0") || trimmed.includes("..") || !trimmed.startsWith("/")) {
    return { kind: "rejected", reason: "invalid_root" };
  }
  return { kind: "ok", path: trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

export function readNullableString(
  row: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = row[key];
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

export function coerceInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  }
  return null;
}

export function readInt(row: Record<string, unknown>, key: string): number | null {
  return coerceInt(row[key]);
}

export function readNullableInt(
  row: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const value = row[key];
  if (value === null) return null;
  const parsed = coerceInt(value);
  return parsed === null ? undefined : parsed;
}
