import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  backupFilename,
  backupToSql,
  exportBackup,
} from "./backup.ts";
import type { Result, StoreError, TaskVerdict } from "./domain.ts";
import { DEFAULT_BUDGET, STORE_KIND } from "./domain.ts";
import type { Env } from "./env.ts";
import {
  parseNonEmpty,
  parsePositiveInt,
  parseProjectId,
  parseRootPath,
  parseRunId,
  parseSlug,
  parseTaskId,
} from "./parse.ts";
import { sqlSourceFromEnv, withSql } from "./sql-http.ts";
import {
  checkPathAgainstProject,
  claimTask,
  createProject,
  finishRun,
  getProject,
  inspectStatus,
  listProjects,
  prepareRun,
  putContext,
  recordDecision,
  recordEvidence,
  updateTask,
} from "./store.ts";

function jsonResult<T>(result: Result<T>): {
  content: [{ type: "text"; text: string }];
  isError?: boolean;
} {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: result.error }) }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, value: result.value }) }],
  };
}

function invalid(field: string): ReturnType<typeof jsonResult> {
  const error: StoreError = { kind: "invalid_input", field };
  return jsonResult({ ok: false, error });
}

export function createHarnessServer(env: Env): McpServer {
  const source = sqlSourceFromEnv(env);
  const server = new McpServer({
    name: "project-harness",
    version: "0.1.0",
  });

  server.registerTool(
    "harness_ping",
    {
      description: "Prove the remote MCP is reachable and authenticated. Returns store kind.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, value: { store: STORE_KIND, name: "project-harness" } }),
        },
      ],
    }),
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a project. Isolation key is projectId. Optional absolute rootPath for coding.",
      inputSchema: z.object({
        slug: z.string(),
        title: z.string(),
        rootPath: z.string().nullable().optional(),
      }),
    },
    async ({ slug, title, rootPath }) => {
      const parsedSlug = parseSlug(slug);
      const parsedTitle = parseNonEmpty(title, 200);
      if (parsedSlug === null) return invalid("slug");
      if (parsedTitle === null) return invalid("title");
      const root = parseRootPath(rootPath ?? null);
      if (root.kind === "rejected") return invalid(root.reason);
      return jsonResult(
        await withSql(source, (db) =>
          createProject(db, {
            slug: parsedSlug,
            title: parsedTitle,
            rootPath: root.kind === "empty" ? null : root.path,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "list_projects",
    {
      description: "List projects. Does not return context bodies.",
      inputSchema: z.object({}),
    },
    async () => jsonResult(await withSql(source, (db) => listProjects(db))),
  );

  server.registerTool(
    "get_project",
    {
      description: "Get one project by id. Never returns another project's context.",
      inputSchema: z.object({ projectId: z.string() }),
    },
    async ({ projectId }) => {
      const id = parseProjectId(projectId);
      if (id === null) return invalid("projectId");
      return jsonResult(await withSql(source, (db) => getProject(db, id)));
    },
  );

  server.registerTool(
    "put_context",
    {
      description:
        "Upsert one context entry for a named project. Retrieval is always per projectId.",
      inputSchema: z.object({
        projectId: z.string(),
        kind: z.enum(["fact", "constraint", "artifact_ref", "decision", "canary"]),
        key: z.string(),
        body: z.string(),
        provenance: z.string(),
      }),
    },
    async ({ projectId, kind, key, body, provenance }) => {
      const id = parseProjectId(projectId);
      const parsedKey = parseNonEmpty(key, 128);
      const parsedBody = parseNonEmpty(body, 4000);
      const parsedProvenance = parseNonEmpty(provenance, 500);
      if (id === null) return invalid("projectId");
      if (parsedKey === null) return invalid("key");
      if (parsedBody === null) return invalid("body");
      if (parsedProvenance === null) return invalid("provenance");
      return jsonResult(
        await withSql(source, (db) =>
          putContext(db, {
            projectId: id,
            kind,
            key: parsedKey,
            body: parsedBody,
            provenance: parsedProvenance,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "prepare_run",
    {
      description:
        "Create a run and return a bounded capsule for one project only. Never searches all memories.",
      inputSchema: z.object({
        projectId: z.string(),
        goal: z.string(),
        maxHandoffs: z.number().int().optional(),
        maxRevisions: z.number().int().optional(),
        maxContextBytes: z.number().int().optional(),
        maxContextItems: z.number().int().optional(),
      }),
    },
    async ({
      projectId,
      goal,
      maxHandoffs,
      maxRevisions,
      maxContextBytes,
      maxContextItems,
    }) => {
      const id = parseProjectId(projectId);
      const parsedGoal = parseNonEmpty(goal, 2000);
      if (id === null) return invalid("projectId");
      if (parsedGoal === null) return invalid("goal");
      const handoffs =
        maxHandoffs === undefined
          ? DEFAULT_BUDGET.maxHandoffs
          : parsePositiveInt(maxHandoffs, 1, 32);
      const revisions =
        maxRevisions === undefined
          ? DEFAULT_BUDGET.maxRevisions
          : parsePositiveInt(maxRevisions, 1, 16);
      const bytes =
        maxContextBytes === undefined
          ? DEFAULT_BUDGET.maxContextBytes
          : parsePositiveInt(maxContextBytes, 256, 32000);
      const items =
        maxContextItems === undefined
          ? DEFAULT_BUDGET.maxContextItems
          : parsePositiveInt(maxContextItems, 1, 40);
      if (handoffs === null || revisions === null || bytes === null || items === null) {
        return invalid("budget");
      }
      return jsonResult(
        await withSql(source, (db) =>
          prepareRun(db, {
            projectId: id,
            goal: parsedGoal,
            maxHandoffs: handoffs,
            maxRevisions: revisions,
            maxContextBytes: bytes,
            maxContextItems: items,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "claim_task",
    {
      description:
        "Create a claimed task with immutable acceptance criteria. One owner. Increments the run handoff budget.",
      inputSchema: z.object({
        projectId: z.string(),
        runId: z.string(),
        expectedRunVersion: z.number().int(),
        owner: z.string(),
        title: z.string(),
        outcome: z.string(),
        acceptance: z.string(),
        scope: z.string(),
        verification: z.string(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      const runId = parseRunId(args.runId);
      const owner = parseNonEmpty(args.owner, 80);
      const title = parseNonEmpty(args.title, 200);
      const outcome = parseNonEmpty(args.outcome, 2000);
      const acceptance = parseNonEmpty(args.acceptance, 4000);
      const scope = parseNonEmpty(args.scope, 2000);
      const verification = parseNonEmpty(args.verification, 2000);
      if (
        projectId === null ||
        runId === null ||
        owner === null ||
        title === null ||
        outcome === null ||
        acceptance === null ||
        scope === null ||
        verification === null
      ) {
        return invalid("claim_task_fields");
      }
      return jsonResult(
        await withSql(source, (db) =>
          claimTask(db, {
            projectId,
            runId,
            expectedRunVersion: args.expectedRunVersion,
            owner,
            title,
            outcome,
            acceptance,
            scope,
            verification,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "update_task",
    {
      description:
        "Issue pass, revise, or block against the original criteria. Criteria cannot be rewritten here.",
      inputSchema: z.object({
        projectId: z.string(),
        runId: z.string(),
        taskId: z.string(),
        expectedTaskVersion: z.number().int(),
        expectedRunVersion: z.number().int(),
        verdict: z.enum(["passed", "revise", "blocked"]),
        note: z.string().optional(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      const runId = parseRunId(args.runId);
      const taskId = parseTaskId(args.taskId);
      if (projectId === null || runId === null || taskId === null) {
        return invalid("ids");
      }
      let verdict: TaskVerdict;
      if (args.verdict === "passed") {
        verdict = { kind: "passed" };
      } else if (args.verdict === "revise") {
        const note = parseNonEmpty(args.note ?? "", 2000);
        if (note === null) return invalid("revise_note");
        verdict = { kind: "revise", note };
      } else {
        const reason = parseNonEmpty(args.note ?? "", 2000);
        if (reason === null) return invalid("block_reason");
        verdict = { kind: "blocked", reason };
      }
      return jsonResult(
        await withSql(source, (db) =>
          updateTask(db, {
            projectId,
            runId,
            taskId,
            expectedTaskVersion: args.expectedTaskVersion,
            expectedRunVersion: args.expectedRunVersion,
            verdict,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "record_evidence",
    {
      description: "Record an artifact for a run. Self-report is not evidence.",
      inputSchema: z.object({
        projectId: z.string(),
        runId: z.string(),
        taskId: z.string().nullable().optional(),
        kind: z.string(),
        uri: z.string(),
        summary: z.string(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      const runId = parseRunId(args.runId);
      const kind = parseNonEmpty(args.kind, 80);
      const uri = parseNonEmpty(args.uri, 500);
      const summary = parseNonEmpty(args.summary, 2000);
      if (projectId === null || runId === null || kind === null || uri === null || summary === null) {
        return invalid("evidence_fields");
      }
      const taskId =
        args.taskId === null || args.taskId === undefined || args.taskId === ""
          ? null
          : parseTaskId(args.taskId);
      if (args.taskId && taskId === null) return invalid("taskId");
      return jsonResult(
        await withSql(source, (db) =>
          recordEvidence(db, { projectId, runId, taskId, kind, uri, summary }),
        ),
      );
    },
  );

  server.registerTool(
    "record_decision",
    {
      description: "Record lead judgment: act_on, consider, noted, or dismissed. Not a consensus summary.",
      inputSchema: z.object({
        projectId: z.string(),
        runId: z.string(),
        bucket: z.enum(["act_on", "consider", "noted", "dismissed"]),
        finding: z.string(),
        rationale: z.string(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      const runId = parseRunId(args.runId);
      const finding = parseNonEmpty(args.finding, 2000);
      const rationale = parseNonEmpty(args.rationale, 2000);
      if (projectId === null || runId === null || finding === null || rationale === null) {
        return invalid("decision_fields");
      }
      return jsonResult(
        await withSql(source, (db) =>
          recordDecision(db, {
            projectId,
            runId,
            bucket: args.bucket,
            finding,
            rationale,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "finish_run",
    {
      description: "Mark a run finished so it is not treated as live work.",
      inputSchema: z.object({
        projectId: z.string(),
        runId: z.string(),
        expectedRunVersion: z.number().int(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      const runId = parseRunId(args.runId);
      if (projectId === null || runId === null) return invalid("ids");
      return jsonResult(
        await withSql(source, (db) =>
          finishRun(db, {
            projectId,
            runId,
            expectedRunVersion: args.expectedRunVersion,
          }),
        ),
      );
    },
  );

  server.registerTool(
    "inspect_status",
    {
      description: "Inspect one project and optional run: tasks, artifacts, decisions, budgets.",
      inputSchema: z.object({
        projectId: z.string(),
        runId: z.string().nullable().optional(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      if (projectId === null) return invalid("projectId");
      const runId =
        args.runId === null || args.runId === undefined || args.runId === ""
          ? null
          : parseRunId(args.runId);
      if (args.runId && runId === null) return invalid("runId");
      return jsonResult(await withSql(source, (db) => inspectStatus(db, { projectId, runId })));
    },
  );

  server.registerTool(
    "check_path",
    {
      description: "Reject paths outside the project's rootPath. Use before any coding write.",
      inputSchema: z.object({
        projectId: z.string(),
        path: z.string(),
      }),
    },
    async (args) => {
      const projectId = parseProjectId(args.projectId);
      if (projectId === null) return invalid("projectId");
      return jsonResult(
        await withSql(source, async (db) => {
          const project = await getProject(db, projectId);
          if (!project.ok) return project;
          return checkPathAgainstProject(project.value, args.path);
        }),
      );
    },
  );

  server.registerTool(
    "export_backup",
    {
      description:
        "Download a restorable dump of the project store for later. Zero instances expire; keep a local copy.",
      inputSchema: z.object({
        format: z.enum(["sql", "json"]).optional(),
      }),
    },
    async (args) => {
      const format = args.format ?? "sql";
      const document = await withSql(source, (db) => exportBackup(db));
      const filename = backupFilename(document.exportedAtMs, format);
      if (format === "json") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                value: { filename, format, document },
              }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              value: { filename, format, sql: backupToSql(document) },
            }),
          },
        ],
      };
    },
  );

  return server;
}
