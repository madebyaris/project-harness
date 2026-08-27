import type {
  Artifact,
  Capsule,
  ContextEntry,
  ContextKind,
  Decision,
  DecisionBucket,
  Project,
  ProjectId,
  Result,
  Run,
  RunId,
  RunStatus,
  StoreError,
  Task,
  TaskId,
  TaskStatus,
  TaskVerdict,
} from "./domain.ts";
import { DEFAULT_BUDGET, utf8ByteLength } from "./domain.ts";
import { emit } from "./log.ts";
import {
  assertUnderRoot,
  isRecord,
  newId,
  parseArtifactId,
  parseContextEntryId,
  parseContextKind,
  parseDecisionBucket,
  parseDecisionId,
  parseEventId,
  parseProjectId,
  parseRunId,
  parseTaskId,
  readInt,
  readNullableInt,
  readNullableString,
  readString,
} from "./parse.ts";
import { isDuplicateKey, type Sql } from "./sql-types.ts";

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<T>(error: StoreError): Result<T> {
  return { ok: false, error };
}

function nowMs(): number {
  return Date.now();
}

function parseProject(row: unknown): Project | null {
  if (!isRecord(row)) return null;
  const idRaw = readString(row, "id");
  const slug = readString(row, "slug");
  const title = readString(row, "title");
  const createdAtMs = readInt(row, "created_at_ms");
  const updatedAtMs = readInt(row, "updated_at_ms");
  const rootPathField = readNullableString(row, "root_path");
  if (
    idRaw === null ||
    slug === null ||
    title === null ||
    createdAtMs === null ||
    updatedAtMs === null ||
    rootPathField === undefined
  ) {
    return null;
  }
  const id = parseProjectId(idRaw);
  if (id === null) return null;
  return { id, slug, title, rootPath: rootPathField, createdAtMs, updatedAtMs };
}

function parseRunStatus(
  kind: string,
  reason: string | null,
  finishedAtMs: number | null,
): RunStatus | null {
  if (kind === "open") return { kind: "open" };
  if (kind === "budget_exceeded" && reason !== null) {
    return { kind: "budget_exceeded", reason };
  }
  if (kind === "finished" && finishedAtMs !== null) {
    return { kind: "finished", finishedAtMs };
  }
  return null;
}

function parseRun(row: unknown): Run | null {
  if (!isRecord(row)) return null;
  const idRaw = readString(row, "id");
  const projectIdRaw = readString(row, "project_id");
  const goal = readString(row, "goal");
  const version = readInt(row, "version");
  const maxHandoffs = readInt(row, "max_handoffs");
  const maxRevisions = readInt(row, "max_revisions");
  const maxContextBytes = readInt(row, "max_context_bytes");
  const maxContextItems = readInt(row, "max_context_items");
  const handoffCount = readInt(row, "handoff_count");
  const revisionCount = readInt(row, "revision_count");
  const statusKind = readString(row, "status_kind");
  const statusReason = readNullableString(row, "status_reason");
  const finishedAtMs = readNullableInt(row, "finished_at_ms");
  const createdAtMs = readInt(row, "created_at_ms");
  if (
    idRaw === null ||
    projectIdRaw === null ||
    goal === null ||
    version === null ||
    maxHandoffs === null ||
    maxRevisions === null ||
    maxContextBytes === null ||
    maxContextItems === null ||
    handoffCount === null ||
    revisionCount === null ||
    statusKind === null ||
    statusReason === undefined ||
    finishedAtMs === undefined ||
    createdAtMs === null
  ) {
    return null;
  }
  const id = parseRunId(idRaw);
  const projectId = parseProjectId(projectIdRaw);
  const status = parseRunStatus(statusKind, statusReason, finishedAtMs);
  if (id === null || projectId === null || status === null) return null;
  return {
    id,
    projectId,
    goal,
    version,
    maxHandoffs,
    maxRevisions,
    maxContextBytes,
    maxContextItems,
    handoffCount,
    revisionCount,
    status,
    createdAtMs,
  };
}

function parseTaskStatus(
  kind: string,
  owner: string | null,
  note: string | null,
  atMs: number | null,
): TaskStatus | null {
  if (kind === "unclaimed") return { kind: "unclaimed" };
  if (kind === "claimed" && owner !== null && atMs !== null) {
    return { kind: "claimed", owner, atMs };
  }
  if (kind === "passed" && owner !== null && atMs !== null) {
    return { kind: "passed", owner, atMs };
  }
  if (kind === "revise" && owner !== null && note !== null && atMs !== null) {
    return { kind: "revise", owner, note, atMs };
  }
  if (kind === "blocked" && owner !== null && note !== null && atMs !== null) {
    return { kind: "blocked", owner, reason: note, atMs };
  }
  return null;
}

function parseTask(row: unknown): Task | null {
  if (!isRecord(row)) return null;
  const idRaw = readString(row, "id");
  const runIdRaw = readString(row, "run_id");
  const projectIdRaw = readString(row, "project_id");
  const title = readString(row, "title");
  const outcome = readString(row, "outcome");
  const acceptance = readString(row, "acceptance");
  const scope = readString(row, "scope");
  const verification = readString(row, "verification");
  const ownerField = readNullableString(row, "owner");
  const statusKind = readString(row, "status_kind");
  const statusNote = readNullableString(row, "status_note");
  const statusAtMs = readNullableInt(row, "status_at_ms");
  const version = readInt(row, "version");
  const createdAtMs = readInt(row, "created_at_ms");
  if (
    idRaw === null ||
    runIdRaw === null ||
    projectIdRaw === null ||
    title === null ||
    outcome === null ||
    acceptance === null ||
    scope === null ||
    verification === null ||
    ownerField === undefined ||
    statusKind === null ||
    statusNote === undefined ||
    statusAtMs === undefined ||
    version === null ||
    createdAtMs === null
  ) {
    return null;
  }
  const id = parseTaskId(idRaw);
  const runId = parseRunId(runIdRaw);
  const projectId = parseProjectId(projectIdRaw);
  const status = parseTaskStatus(statusKind, ownerField, statusNote, statusAtMs);
  if (id === null || runId === null || projectId === null || status === null) {
    return null;
  }
  return {
    id,
    runId,
    projectId,
    title,
    outcome,
    acceptance,
    scope,
    verification,
    owner: ownerField,
    status,
    version,
    createdAtMs,
  };
}

function parseContext(row: unknown): ContextEntry | null {
  if (!isRecord(row)) return null;
  const idRaw = readString(row, "id");
  const projectIdRaw = readString(row, "project_id");
  const kindRaw = readString(row, "kind");
  const key = readString(row, "key");
  const body = readString(row, "body");
  const provenance = readString(row, "provenance");
  const byteLength = readInt(row, "byte_length");
  const createdAtMs = readInt(row, "created_at_ms");
  if (
    idRaw === null ||
    projectIdRaw === null ||
    kindRaw === null ||
    key === null ||
    body === null ||
    provenance === null ||
    byteLength === null ||
    createdAtMs === null
  ) {
    return null;
  }
  const id = parseContextEntryId(idRaw);
  const projectId = parseProjectId(projectIdRaw);
  const kind = parseContextKind(kindRaw);
  if (id === null || projectId === null || kind === null) return null;
  return { id, projectId, kind, key, body, provenance, byteLength, createdAtMs };
}

function parseArtifact(row: unknown): Artifact | null {
  if (!isRecord(row)) return null;
  const idRaw = readString(row, "id");
  const projectIdRaw = readString(row, "project_id");
  const runIdRaw = readString(row, "run_id");
  const taskIdField = readNullableString(row, "task_id");
  const kind = readString(row, "kind");
  const uri = readString(row, "uri");
  const summary = readString(row, "summary");
  const createdAtMs = readInt(row, "created_at_ms");
  if (
    idRaw === null ||
    projectIdRaw === null ||
    runIdRaw === null ||
    taskIdField === undefined ||
    kind === null ||
    uri === null ||
    summary === null ||
    createdAtMs === null
  ) {
    return null;
  }
  const id = parseArtifactId(idRaw);
  const projectId = parseProjectId(projectIdRaw);
  const runId = parseRunId(runIdRaw);
  const taskId = taskIdField === null ? null : parseTaskId(taskIdField);
  if (
    id === null ||
    projectId === null ||
    runId === null ||
    (taskIdField !== null && taskId === null)
  ) {
    return null;
  }
  return { id, projectId, runId, taskId, kind, uri, summary, createdAtMs };
}

function parseDecision(row: unknown): Decision | null {
  if (!isRecord(row)) return null;
  const idRaw = readString(row, "id");
  const projectIdRaw = readString(row, "project_id");
  const runIdRaw = readString(row, "run_id");
  const bucketRaw = readString(row, "bucket");
  const finding = readString(row, "finding");
  const rationale = readString(row, "rationale");
  const createdAtMs = readInt(row, "created_at_ms");
  if (
    idRaw === null ||
    projectIdRaw === null ||
    runIdRaw === null ||
    bucketRaw === null ||
    finding === null ||
    rationale === null ||
    createdAtMs === null
  ) {
    return null;
  }
  const id = parseDecisionId(idRaw);
  const projectId = parseProjectId(projectIdRaw);
  const runId = parseRunId(runIdRaw);
  const bucket = parseDecisionBucket(bucketRaw);
  if (id === null || projectId === null || runId === null || bucket === null) {
    return null;
  }
  return { id, projectId, runId, bucket, finding, rationale, createdAtMs };
}

async function appendEvent(
  db: Sql,
  projectId: ProjectId,
  runId: RunId | null,
  type: string,
  payload: Record<string, string | number | boolean | null>,
): Promise<void> {
  const id = parseEventId(newId());
  if (id === null) return;
  await db.run(
    "INSERT INTO events (id, project_id, run_id, type, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
    [id, projectId, runId, type, JSON.stringify(payload), nowMs()],
  );
}

async function loadProject(db: Sql, projectId: ProjectId): Promise<Result<Project>> {
  const row = await db.one("SELECT * FROM projects WHERE id = ?", [projectId]);
  const project = parseProject(row);
  if (project === null) {
    return err({ kind: "not_found", entity: "project", id: projectId });
  }
  return ok(project);
}

async function loadRun(db: Sql, runId: RunId): Promise<Result<Run>> {
  const row = await db.one("SELECT * FROM runs WHERE id = ?", [runId]);
  const run = parseRun(row);
  if (run === null) {
    return err({ kind: "not_found", entity: "run", id: runId });
  }
  return ok(run);
}

async function loadTask(db: Sql, taskId: TaskId): Promise<Result<Task>> {
  const row = await db.one("SELECT * FROM tasks WHERE id = ?", [taskId]);
  const task = parseTask(row);
  if (task === null) {
    return err({ kind: "not_found", entity: "task", id: taskId });
  }
  return ok(task);
}

function requireSameProject(expected: ProjectId, actual: ProjectId): Result<true> {
  if (expected !== actual) {
    return err({ kind: "cross_project", expected, actual });
  }
  return ok(true);
}

function requireOpen(run: Run): Result<true> {
  if (run.status.kind !== "open") {
    return err({ kind: "run_closed", runId: run.id, status: run.status.kind });
  }
  return ok(true);
}

export async function createProject(
  db: Sql,
  input: { slug: string; title: string; rootPath: string | null },
): Promise<Result<Project>> {
  const id = parseProjectId(newId());
  if (id === null) {
    return err({ kind: "not_found", entity: "project", id: "id-failed" });
  }
  const createdAtMs = nowMs();
  const project: Project = {
    id,
    slug: input.slug,
    title: input.title,
    rootPath: input.rootPath,
    createdAtMs,
    updatedAtMs: createdAtMs,
  };
  try {
    await db.run(
      "INSERT INTO projects (id, slug, title, root_path, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
      [project.id, project.slug, project.title, project.rootPath, createdAtMs, createdAtMs],
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      return err({ kind: "slug_taken", slug: input.slug });
    }
    throw error;
  }
  await appendEvent(db, project.id, null, "project_created", { slug: project.slug });
  emit("project_created", { projectId: project.id, slug: project.slug });
  return ok(project);
}

export async function listProjects(db: Sql): Promise<Result<Project[]>> {
  const rows = await db.many("SELECT * FROM projects ORDER BY created_at_ms DESC");
  const projects: Project[] = [];
  for (const row of rows) {
    const project = parseProject(row);
    if (project === null) {
      return err({ kind: "not_found", entity: "project", id: "row" });
    }
    projects.push(project);
  }
  return ok(projects);
}

export async function getProject(db: Sql, projectId: ProjectId): Promise<Result<Project>> {
  return loadProject(db, projectId);
}

export async function putContext(
  db: Sql,
  input: {
    projectId: ProjectId;
    kind: ContextKind;
    key: string;
    body: string;
    provenance: string;
  },
): Promise<Result<ContextEntry>> {
  const project = await loadProject(db, input.projectId);
  if (!project.ok) return err(project.error);
  const byteLength = utf8ByteLength(input.body);
  const existing = await db.one(
    "SELECT id FROM context_entries WHERE project_id = ? AND `key` = ?",
    [input.projectId, input.key],
  );
  const createdAtMs = nowMs();
  if (existing !== null) {
    const idRaw = readString(existing, "id");
    const id = idRaw === null ? null : parseContextEntryId(idRaw);
    if (id === null) {
      return err({ kind: "not_found", entity: "context", id: input.key });
    }
    await db.run(
      "UPDATE context_entries SET kind = ?, body = ?, provenance = ?, byte_length = ?, created_at_ms = ? WHERE id = ?",
      [input.kind, input.body, input.provenance, byteLength, createdAtMs, id],
    );
    const entry: ContextEntry = {
      id,
      projectId: input.projectId,
      kind: input.kind,
      key: input.key,
      body: input.body,
      provenance: input.provenance,
      byteLength,
      createdAtMs,
    };
    await appendEvent(db, input.projectId, null, "context_upserted", {
      key: input.key,
      kind: input.kind,
    });
    return ok(entry);
  }
  const id = parseContextEntryId(newId());
  if (id === null) {
    return err({ kind: "not_found", entity: "context", id: "id-failed" });
  }
  await db.run(
    "INSERT INTO context_entries (id, project_id, kind, `key`, body, provenance, byte_length, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      input.projectId,
      input.kind,
      input.key,
      input.body,
      input.provenance,
      byteLength,
      createdAtMs,
    ],
  );
  const entry: ContextEntry = {
    id,
    projectId: input.projectId,
    kind: input.kind,
    key: input.key,
    body: input.body,
    provenance: input.provenance,
    byteLength,
    createdAtMs,
  };
  await appendEvent(db, input.projectId, null, "context_upserted", {
    key: input.key,
    kind: input.kind,
  });
  return ok(entry);
}

function buildCapsule(project: Project, run: Run, rows: ContextEntry[]): Capsule {
  const selected: ContextEntry[] = [];
  let bytes = 0;
  let truncated = false;
  for (const entry of rows) {
    if (selected.length >= run.maxContextItems) {
      truncated = true;
      break;
    }
    if (bytes + entry.byteLength > run.maxContextBytes) {
      truncated = true;
      break;
    }
    selected.push(entry);
    bytes += entry.byteLength;
  }
  if (selected.length < rows.length) truncated = true;
  return {
    project,
    run,
    context: selected,
    contextBytes: bytes,
    contextItems: selected.length,
    truncated,
  };
}

export async function prepareRun(
  db: Sql,
  input: {
    projectId: ProjectId;
    goal: string;
    maxHandoffs?: number;
    maxRevisions?: number;
    maxContextBytes?: number;
    maxContextItems?: number;
  },
): Promise<Result<Capsule>> {
  const project = await loadProject(db, input.projectId);
  if (!project.ok) return err(project.error);
  const id = parseRunId(newId());
  if (id === null) {
    return err({ kind: "not_found", entity: "run", id: "id-failed" });
  }
  const createdAtMs = nowMs();
  const run: Run = {
    id,
    projectId: input.projectId,
    goal: input.goal,
    version: 1,
    maxHandoffs: input.maxHandoffs ?? DEFAULT_BUDGET.maxHandoffs,
    maxRevisions: input.maxRevisions ?? DEFAULT_BUDGET.maxRevisions,
    maxContextBytes: input.maxContextBytes ?? DEFAULT_BUDGET.maxContextBytes,
    maxContextItems: input.maxContextItems ?? DEFAULT_BUDGET.maxContextItems,
    handoffCount: 0,
    revisionCount: 0,
    status: { kind: "open" },
    createdAtMs,
  };
  await db.run(
    `INSERT INTO runs (
      id, project_id, goal, version, max_handoffs, max_revisions,
      max_context_bytes, max_context_items, handoff_count, revision_count,
      status_kind, status_reason, finished_at_ms, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.projectId,
      run.goal,
      run.version,
      run.maxHandoffs,
      run.maxRevisions,
      run.maxContextBytes,
      run.maxContextItems,
      run.handoffCount,
      run.revisionCount,
      "open",
      null,
      null,
      createdAtMs,
    ],
  );
  const contextRows = await db.many(
    "SELECT * FROM context_entries WHERE project_id = ? ORDER BY created_at_ms DESC",
    [input.projectId],
  );
  const entries: ContextEntry[] = [];
  for (const row of contextRows) {
    const entry = parseContext(row);
    if (entry === null) {
      return err({ kind: "not_found", entity: "context", id: "row" });
    }
    entries.push(entry);
  }
  const capsule = buildCapsule(project.value, run, entries);
  await appendEvent(db, input.projectId, run.id, "run_prepared", {
    goal: run.goal,
    contextItems: capsule.contextItems,
    truncated: capsule.truncated,
  });
  emit("run_prepared", {
    projectId: input.projectId,
    runId: run.id,
    contextItems: capsule.contextItems,
    truncated: capsule.truncated,
  });
  return ok(capsule);
}

export async function claimTask(
  db: Sql,
  input: {
    projectId: ProjectId;
    runId: RunId;
    owner: string;
    title: string;
    outcome: string;
    acceptance: string;
    scope: string;
    verification: string;
    expectedRunVersion: number;
  },
): Promise<Result<Task>> {
  const runResult = await loadRun(db, input.runId);
  if (!runResult.ok) return err(runResult.error);
  const run = runResult.value;
  const projectCheck = requireSameProject(input.projectId, run.projectId);
  if (!projectCheck.ok) return err(projectCheck.error);
  const open = requireOpen(run);
  if (!open.ok) return err(open.error);
  if (run.version !== input.expectedRunVersion) {
    return err({
      kind: "conflict",
      entity: "run",
      expected: input.expectedRunVersion,
      actual: run.version,
    });
  }
  if (run.handoffCount >= run.maxHandoffs) {
    await db.run(
      "UPDATE runs SET status_kind = ?, status_reason = ?, version = version + 1 WHERE id = ? AND version = ?",
      ["budget_exceeded", "max_handoffs", run.id, run.version],
    );
    return err({ kind: "budget_exceeded", runId: run.id, budget: "max_handoffs" });
  }
  const id = parseTaskId(newId());
  if (id === null) {
    return err({ kind: "not_found", entity: "task", id: "id-failed" });
  }
  const createdAtMs = nowMs();
  const nextHandoffs = run.handoffCount + 1;
  const nextVersion = run.version + 1;
  try {
    await db.transact(async (tx) => {
      const updated = await tx.run(
        `UPDATE runs SET handoff_count = ?, version = ?
         WHERE id = ? AND version = ? AND status_kind = 'open'`,
        [nextHandoffs, nextVersion, run.id, run.version],
      );
      if (updated.affectedRows !== 1) {
        throw new Error("optimistic_conflict");
      }
      await tx.run(
        `INSERT INTO tasks (
          id, run_id, project_id, title, outcome, acceptance, scope, verification,
          owner, status_kind, status_note, status_at_ms, version, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          run.id,
          input.projectId,
          input.title,
          input.outcome,
          input.acceptance,
          input.scope,
          input.verification,
          input.owner,
          "claimed",
          null,
          createdAtMs,
          1,
          createdAtMs,
        ],
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "optimistic_conflict") {
      return err({
        kind: "conflict",
        entity: "run",
        expected: input.expectedRunVersion,
        actual: run.version,
      });
    }
    throw error;
  }
  const task: Task = {
    id,
    runId: run.id,
    projectId: input.projectId,
    title: input.title,
    outcome: input.outcome,
    acceptance: input.acceptance,
    scope: input.scope,
    verification: input.verification,
    owner: input.owner,
    status: { kind: "claimed", owner: input.owner, atMs: createdAtMs },
    version: 1,
    createdAtMs,
  };
  await appendEvent(db, input.projectId, run.id, "task_claimed", {
    taskId: task.id,
    owner: input.owner,
  });
  return ok(task);
}

export async function updateTask(
  db: Sql,
  input: {
    projectId: ProjectId;
    runId: RunId;
    taskId: TaskId;
    expectedTaskVersion: number;
    expectedRunVersion: number;
    verdict: TaskVerdict;
  },
): Promise<Result<Task>> {
  const taskResult = await loadTask(db, input.taskId);
  if (!taskResult.ok) return err(taskResult.error);
  const task = taskResult.value;
  const projectCheck = requireSameProject(input.projectId, task.projectId);
  if (!projectCheck.ok) return err(projectCheck.error);
  if (task.runId !== input.runId) {
    return err({
      kind: "not_found",
      entity: "task",
      id: input.taskId,
    });
  }
  if (task.version !== input.expectedTaskVersion) {
    return err({
      kind: "conflict",
      entity: "task",
      expected: input.expectedTaskVersion,
      actual: task.version,
    });
  }
  if (task.status.kind !== "claimed" && task.status.kind !== "revise") {
    return err({ kind: "criteria_locked", taskId: task.id });
  }
  const runResult = await loadRun(db, input.runId);
  if (!runResult.ok) return err(runResult.error);
  const run = runResult.value;
  const open = requireOpen(run);
  if (!open.ok) return err(open.error);
  if (run.version !== input.expectedRunVersion) {
    return err({
      kind: "conflict",
      entity: "run",
      expected: input.expectedRunVersion,
      actual: run.version,
    });
  }
  const owner = task.owner;
  if (owner === null) {
    return err({ kind: "not_found", entity: "task", id: task.id });
  }
  const atMs = nowMs();
  let statusKind: string;
  let statusNote: string | null;
  let nextRevision = run.revisionCount;
  let nextRunStatus = run.status.kind;
  let statusReason: string | null = null;
  if (input.verdict.kind === "passed") {
    statusKind = "passed";
    statusNote = null;
  } else if (input.verdict.kind === "revise") {
    if (run.revisionCount >= run.maxRevisions) {
      await db.run(
        "UPDATE runs SET status_kind = ?, status_reason = ?, version = version + 1 WHERE id = ? AND version = ?",
        ["budget_exceeded", "max_revisions", run.id, run.version],
      );
      return err({ kind: "budget_exceeded", runId: run.id, budget: "max_revisions" });
    }
    statusKind = "revise";
    statusNote = input.verdict.note;
    nextRevision = run.revisionCount + 1;
  } else {
    statusKind = "blocked";
    statusNote = input.verdict.reason;
  }
  const nextTaskVersion = task.version + 1;
  const nextRunVersion = run.version + 1;
  try {
    await db.transact(async (tx) => {
      const taskMeta = await tx.run(
        `UPDATE tasks SET status_kind = ?, status_note = ?, status_at_ms = ?, version = ?
         WHERE id = ? AND version = ?`,
        [statusKind, statusNote, atMs, nextTaskVersion, task.id, task.version],
      );
      const runMeta = await tx.run(
        `UPDATE runs SET revision_count = ?, version = ?, status_kind = ?, status_reason = ?
         WHERE id = ? AND version = ? AND status_kind = 'open'`,
        [nextRevision, nextRunVersion, nextRunStatus, statusReason, run.id, run.version],
      );
      if (taskMeta.affectedRows !== 1 || runMeta.affectedRows !== 1) {
        throw new Error("optimistic_conflict");
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "optimistic_conflict") {
      return err({
        kind: "conflict",
        entity: "task",
        expected: input.expectedTaskVersion,
        actual: task.version,
      });
    }
    throw error;
  }
  const reloaded = await loadTask(db, task.id);
  if (!reloaded.ok) return err(reloaded.error);
  await appendEvent(db, input.projectId, run.id, "task_verdict", {
    taskId: task.id,
    verdict: input.verdict.kind,
  });
  return reloaded;
}

export async function recordEvidence(
  db: Sql,
  input: {
    projectId: ProjectId;
    runId: RunId;
    taskId: TaskId | null;
    kind: string;
    uri: string;
    summary: string;
  },
): Promise<Result<Artifact>> {
  const runResult = await loadRun(db, input.runId);
  if (!runResult.ok) return err(runResult.error);
  const projectCheck = requireSameProject(input.projectId, runResult.value.projectId);
  if (!projectCheck.ok) return err(projectCheck.error);
  if (input.taskId !== null) {
    const taskResult = await loadTask(db, input.taskId);
    if (!taskResult.ok) return err(taskResult.error);
    const taskProject = requireSameProject(input.projectId, taskResult.value.projectId);
    if (!taskProject.ok) return err(taskProject.error);
    if (taskResult.value.runId !== input.runId) {
      return err({ kind: "not_found", entity: "task", id: input.taskId });
    }
  }
  const id = parseArtifactId(newId());
  if (id === null) {
    return err({ kind: "not_found", entity: "artifact", id: "id-failed" });
  }
  const createdAtMs = nowMs();
  await db.run(
    `INSERT INTO artifacts (id, project_id, run_id, task_id, kind, uri, summary, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.projectId,
      input.runId,
      input.taskId,
      input.kind,
      input.uri,
      input.summary,
      createdAtMs,
    ],
  );
  const artifact: Artifact = {
    id,
    projectId: input.projectId,
    runId: input.runId,
    taskId: input.taskId,
    kind: input.kind,
    uri: input.uri,
    summary: input.summary,
    createdAtMs,
  };
  await appendEvent(db, input.projectId, input.runId, "evidence_recorded", {
    artifactId: id,
    kind: input.kind,
  });
  return ok(artifact);
}

export async function recordDecision(
  db: Sql,
  input: {
    projectId: ProjectId;
    runId: RunId;
    bucket: DecisionBucket;
    finding: string;
    rationale: string;
  },
): Promise<Result<Decision>> {
  const runResult = await loadRun(db, input.runId);
  if (!runResult.ok) return err(runResult.error);
  const projectCheck = requireSameProject(input.projectId, runResult.value.projectId);
  if (!projectCheck.ok) return err(projectCheck.error);
  const id = parseDecisionId(newId());
  if (id === null) {
    return err({ kind: "not_found", entity: "decision", id: "id-failed" });
  }
  const createdAtMs = nowMs();
  await db.run(
    `INSERT INTO decisions (id, project_id, run_id, bucket, finding, rationale, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.projectId, input.runId, input.bucket, input.finding, input.rationale, createdAtMs],
  );
  const decision: Decision = {
    id,
    projectId: input.projectId,
    runId: input.runId,
    bucket: input.bucket,
    finding: input.finding,
    rationale: input.rationale,
    createdAtMs,
  };
  await appendEvent(db, input.projectId, input.runId, "decision_recorded", {
    bucket: input.bucket,
  });
  return ok(decision);
}

export async function finishRun(
  db: Sql,
  input: { projectId: ProjectId; runId: RunId; expectedRunVersion: number },
): Promise<Result<Run>> {
  const runResult = await loadRun(db, input.runId);
  if (!runResult.ok) return err(runResult.error);
  const run = runResult.value;
  const projectCheck = requireSameProject(input.projectId, run.projectId);
  if (!projectCheck.ok) return err(projectCheck.error);
  if (run.status.kind === "finished") {
    return err({ kind: "run_closed", runId: run.id, status: "finished" });
  }
  if (run.version !== input.expectedRunVersion) {
    return err({
      kind: "conflict",
      entity: "run",
      expected: input.expectedRunVersion,
      actual: run.version,
    });
  }
  const finishedAtMs = nowMs();
  const updated = await db.run(
    `UPDATE runs SET status_kind = 'finished', finished_at_ms = ?, version = version + 1
     WHERE id = ? AND version = ?`,
    [finishedAtMs, run.id, run.version],
  );
  if (updated.affectedRows !== 1) {
    return err({
      kind: "conflict",
      entity: "run",
      expected: input.expectedRunVersion,
      actual: run.version,
    });
  }
  await appendEvent(db, input.projectId, run.id, "run_finished", {});
  return loadRun(db, run.id);
}

export type StatusSnapshot = {
  project: Project;
  run: Run | null;
  tasks: Task[];
  artifacts: Artifact[];
  decisions: Decision[];
};

export async function inspectStatus(
  db: Sql,
  input: { projectId: ProjectId; runId: RunId | null },
): Promise<Result<StatusSnapshot>> {
  const project = await loadProject(db, input.projectId);
  if (!project.ok) return err(project.error);
  let run: Run | null = null;
  if (input.runId !== null) {
    const loaded = await loadRun(db, input.runId);
    if (!loaded.ok) return err(loaded.error);
    const projectCheck = requireSameProject(input.projectId, loaded.value.projectId);
    if (!projectCheck.ok) return err(projectCheck.error);
    run = loaded.value;
  } else {
    const row = await db.one(
      "SELECT * FROM runs WHERE project_id = ? ORDER BY created_at_ms DESC LIMIT 1",
      [input.projectId],
    );
    run = row === null ? null : parseRun(row);
  }
  const tasks: Task[] = [];
  const artifacts: Artifact[] = [];
  const decisions: Decision[] = [];
  if (run !== null) {
    const taskRows = await db.many(
      "SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at_ms DESC",
      [run.id],
    );
    for (const row of taskRows) {
      const task = parseTask(row);
      if (task === null) {
        return err({ kind: "not_found", entity: "task", id: "row" });
      }
      tasks.push(task);
    }
    const artifactRows = await db.many(
      "SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at_ms DESC",
      [run.id],
    );
    for (const row of artifactRows) {
      const artifact = parseArtifact(row);
      if (artifact === null) {
        return err({ kind: "not_found", entity: "artifact", id: "row" });
      }
      artifacts.push(artifact);
    }
    const decisionRows = await db.many(
      "SELECT * FROM decisions WHERE run_id = ? ORDER BY created_at_ms DESC",
      [run.id],
    );
    for (const row of decisionRows) {
      const decision = parseDecision(row);
      if (decision === null) {
        return err({ kind: "not_found", entity: "decision", id: "row" });
      }
      decisions.push(decision);
    }
  }
  return ok({ project: project.value, run, tasks, artifacts, decisions });
}

export function checkPathAgainstProject(project: Project, candidate: string): Result<string> {
  if (project.rootPath === null) {
    return err({ kind: "invalid_path", reason: "project_has_no_root" });
  }
  const check = assertUnderRoot(project.rootPath, candidate);
  if (check.kind === "rejected") {
    return err({ kind: "invalid_path", reason: check.reason });
  }
  return ok(check.path);
}
