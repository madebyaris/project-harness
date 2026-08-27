export type ProjectId = string & { readonly __brand: "ProjectId" };
export type RunId = string & { readonly __brand: "RunId" };
export type TaskId = string & { readonly __brand: "TaskId" };
export type ContextEntryId = string & { readonly __brand: "ContextEntryId" };
export type ArtifactId = string & { readonly __brand: "ArtifactId" };
export type DecisionId = string & { readonly __brand: "DecisionId" };
export type EventId = string & { readonly __brand: "EventId" };

export type ContextKind =
  | "fact"
  | "constraint"
  | "artifact_ref"
  | "decision"
  | "canary";

export type DecisionBucket = "act_on" | "consider" | "noted" | "dismissed";

export type Project = {
  id: ProjectId;
  slug: string;
  title: string;
  rootPath: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ContextEntry = {
  id: ContextEntryId;
  projectId: ProjectId;
  kind: ContextKind;
  key: string;
  body: string;
  provenance: string;
  byteLength: number;
  createdAtMs: number;
};

export type RunStatus =
  | { kind: "open" }
  | { kind: "budget_exceeded"; reason: string }
  | { kind: "finished"; finishedAtMs: number };

export type Run = {
  id: RunId;
  projectId: ProjectId;
  goal: string;
  version: number;
  maxHandoffs: number;
  maxRevisions: number;
  maxContextBytes: number;
  maxContextItems: number;
  handoffCount: number;
  revisionCount: number;
  status: RunStatus;
  createdAtMs: number;
};

export type TaskStatus =
  | { kind: "unclaimed" }
  | { kind: "claimed"; owner: string; atMs: number }
  | { kind: "passed"; owner: string; atMs: number }
  | { kind: "revise"; owner: string; note: string; atMs: number }
  | { kind: "blocked"; owner: string; reason: string; atMs: number };

export type Task = {
  id: TaskId;
  runId: RunId;
  projectId: ProjectId;
  title: string;
  outcome: string;
  acceptance: string;
  scope: string;
  verification: string;
  owner: string | null;
  status: TaskStatus;
  version: number;
  createdAtMs: number;
};

export type Artifact = {
  id: ArtifactId;
  projectId: ProjectId;
  runId: RunId;
  taskId: TaskId | null;
  kind: string;
  uri: string;
  summary: string;
  createdAtMs: number;
};

export type Decision = {
  id: DecisionId;
  projectId: ProjectId;
  runId: RunId;
  bucket: DecisionBucket;
  finding: string;
  rationale: string;
  createdAtMs: number;
};

export type EventRecord = {
  id: EventId;
  projectId: ProjectId;
  runId: RunId | null;
  type: string;
  payloadJson: string;
  createdAtMs: number;
};

export type Capsule = {
  project: Project;
  run: Run;
  context: ContextEntry[];
  contextBytes: number;
  contextItems: number;
  truncated: boolean;
};

export type StoreError =
  | { kind: "not_found"; entity: string; id: string }
  | { kind: "conflict"; entity: string; expected: number; actual: number }
  | { kind: "slug_taken"; slug: string }
  | { kind: "already_owned"; taskId: TaskId; owner: string }
  | { kind: "budget_exceeded"; runId: RunId; budget: string }
  | { kind: "run_closed"; runId: RunId; status: RunStatus["kind"] }
  | { kind: "cross_project"; expected: ProjectId; actual: ProjectId }
  | { kind: "invalid_path"; reason: string }
  | { kind: "invalid_input"; field: string }
  | { kind: "criteria_locked"; taskId: TaskId };

export type TaskVerdict =
  | { kind: "passed" }
  | { kind: "revise"; note: string }
  | { kind: "blocked"; reason: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: StoreError };

export const DEFAULT_BUDGET = {
  maxHandoffs: 8,
  maxRevisions: 4,
  maxContextBytes: 8000,
  maxContextItems: 12,
} as const;

export const STORE_KIND = "tidb-cloud-zero" as const;

export const BACKUP_FORMAT = "project-harness-backup-v1" as const;

export const DEFAULT_DATABASE = "project_harness" as const;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
