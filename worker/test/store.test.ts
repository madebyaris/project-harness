import { describe, expect, it } from "vitest";
import { testSql, uniqueSlug } from "./helpers.ts";
import {
  claimTask,
  createProject,
  finishRun,
  inspectStatus,
  prepareRun,
  putContext,
  recordDecision,
  recordEvidence,
  updateTask,
  checkPathAgainstProject,
} from "../src/store.ts";

describe("project store", () => {
  it("does not leak project A canaries into project B capsules", async () => {
    const db = await testSql();
    const projectA = await createProject(db, {
      slug: uniqueSlug("alpha"),
      title: "Alpha",
      rootPath: "/workspace/alpha",
    });
    const projectB = await createProject(db, {
      slug: uniqueSlug("beta"),
      title: "Beta",
      rootPath: "/workspace/beta",
    });
    expect(projectA.ok).toBe(true);
    expect(projectB.ok).toBe(true);
    if (!projectA.ok || !projectB.ok) return;
    await putContext(db, {
      projectId: projectA.value.id,
      kind: "canary",
      key: "secret-a",
      body: "CANARY_ALPHA_TOKEN_NEVER_CROSS",
      provenance: "eval/canary-a.md",
    });
    await putContext(db, {
      projectId: projectB.value.id,
      kind: "canary",
      key: "secret-b",
      body: "CANARY_BETA_TOKEN_NEVER_CROSS",
      provenance: "eval/canary-b.md",
    });
    const capsuleB = await prepareRun(db, {
      projectId: projectB.value.id,
      goal: "work only on beta",
    });
    expect(capsuleB.ok).toBe(true);
    if (!capsuleB.ok) return;
    const bodies = capsuleB.value.context.map((entry) => entry.body).join("\n");
    expect(bodies).toContain("CANARY_BETA_TOKEN_NEVER_CROSS");
    expect(bodies).not.toContain("CANARY_ALPHA_TOKEN_NEVER_CROSS");
    expect(capsuleB.value.project.id).toBe(projectB.value.id);
  });

  it("caps capsule items and bytes", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("cap"),
      title: "Cap",
      rootPath: null,
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    await putContext(db, {
      projectId: project.value.id,
      kind: "fact",
      key: "one",
      body: "aaaa",
      provenance: "test",
    });
    await putContext(db, {
      projectId: project.value.id,
      kind: "fact",
      key: "two",
      body: "bbbbbbbb",
      provenance: "test",
    });
    const capsule = await prepareRun(db, {
      projectId: project.value.id,
      goal: "tiny",
      maxContextItems: 1,
      maxContextBytes: 100,
    });
    expect(capsule.ok).toBe(true);
    if (!capsule.ok) return;
    expect(capsule.value.contextItems).toBe(1);
    expect(capsule.value.truncated).toBe(true);
  });

  it("upserts context by project and key", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("upsert"),
      title: "Upsert",
      rootPath: null,
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const first = await putContext(db, {
      projectId: project.value.id,
      kind: "fact",
      key: "same",
      body: "v1",
      provenance: "t",
    });
    const second = await putContext(db, {
      projectId: project.value.id,
      kind: "fact",
      key: "same",
      body: "v2",
      provenance: "t",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.body).toBe("v2");
  });

  it("rejects a duplicate slug", async () => {
    const db = await testSql();
    const slug = uniqueSlug("dup");
    const first = await createProject(db, { slug, title: "One", rootPath: null });
    const second = await createProject(db, { slug, title: "Two", rootPath: null });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("slug_taken");
  });

  it("stops at the handoff budget", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("handoff"),
      title: "Handoff",
      rootPath: null,
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const capsule = await prepareRun(db, {
      projectId: project.value.id,
      goal: "one shot",
      maxHandoffs: 1,
    });
    expect(capsule.ok).toBe(true);
    if (!capsule.ok) return;
    const first = await claimTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      expectedRunVersion: capsule.value.run.version,
      owner: "worker-1",
      title: "t1",
      outcome: "done",
      acceptance: "tests pass",
      scope: "/tmp",
      verification: "npm test",
    });
    expect(first.ok).toBe(true);
    const status = await inspectStatus(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
    });
    expect(status.ok).toBe(true);
    if (!status.ok || status.value.run === null) return;
    const second = await claimTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      expectedRunVersion: status.value.run.version,
      owner: "worker-2",
      title: "t2",
      outcome: "done",
      acceptance: "tests pass",
      scope: "/tmp",
      verification: "npm test",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("budget_exceeded");
  });

  it("rejects stale run versions", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("conflict"),
      title: "Conflict",
      rootPath: null,
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const capsule = await prepareRun(db, { projectId: project.value.id, goal: "v" });
    expect(capsule.ok).toBe(true);
    if (!capsule.ok) return;
    const stale = await claimTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      expectedRunVersion: 99,
      owner: "worker-1",
      title: "t",
      outcome: "o",
      acceptance: "a",
      scope: "s",
      verification: "v",
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.kind).toBe("conflict");
  });

  it("locks criteria after a pass", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("lock"),
      title: "Lock",
      rootPath: null,
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const capsule = await prepareRun(db, { projectId: project.value.id, goal: "lock" });
    expect(capsule.ok).toBe(true);
    if (!capsule.ok) return;
    const claimed = await claimTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      expectedRunVersion: 1,
      owner: "lead",
      title: "do it",
      outcome: "ship",
      acceptance: "original criteria",
      scope: "/workspace/lock",
      verification: "npm test",
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const passed = await updateTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      taskId: claimed.value.id,
      expectedTaskVersion: 1,
      expectedRunVersion: 2,
      verdict: { kind: "passed" },
    });
    expect(passed.ok).toBe(true);
    const again = await updateTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      taskId: claimed.value.id,
      expectedTaskVersion: 2,
      expectedRunVersion: 3,
      verdict: { kind: "revise", note: "rewrite criteria" },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.kind).toBe("criteria_locked");
  });

  it("records evidence, decisions, and finishes a run", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("flow"),
      title: "Flow",
      rootPath: "/workspace/flow",
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const capsule = await prepareRun(db, { projectId: project.value.id, goal: "flow" });
    expect(capsule.ok).toBe(true);
    if (!capsule.ok) return;
    const claimed = await claimTask(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      expectedRunVersion: 1,
      owner: "coder",
      title: "code",
      outcome: "patch",
      acceptance: "tests",
      scope: "/workspace/flow",
      verification: "npm test",
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const evidence = await recordEvidence(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      taskId: claimed.value.id,
      kind: "diff",
      uri: "git://flow",
      summary: "real diff",
    });
    expect(evidence.ok).toBe(true);
    const decision = await recordDecision(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      bucket: "act_on",
      finding: "tests passed",
      rationale: "saw npm test output",
    });
    expect(decision.ok).toBe(true);
    const finished = await finishRun(db, {
      projectId: project.value.id,
      runId: capsule.value.run.id,
      expectedRunVersion: 2,
    });
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;
    expect(finished.value.status.kind).toBe("finished");
  });

  it("rejects paths outside the project root", async () => {
    const db = await testSql();
    const project = await createProject(db, {
      slug: uniqueSlug("path"),
      title: "Path",
      rootPath: "/workspace/path",
    });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const bad = checkPathAgainstProject(project.value, "/workspace/other/file.ts");
    expect(bad.ok).toBe(false);
    const good = checkPathAgainstProject(project.value, "/workspace/path/src/a.ts");
    expect(good.ok).toBe(true);
  });
});
