import { describe, expect, it } from "vitest";
import {
  backupToSql,
  exportBackup,
  parseBackupJson,
  restoreBackup,
} from "../src/backup.ts";
import { BACKUP_FORMAT } from "../src/domain.ts";
import { createProject, getProject, listProjects } from "../src/store.ts";
import { testSql, uniqueSlug } from "./helpers.ts";

describe("backup", () => {
  it("round-trips a project through json restore", async () => {
    const db = await testSql();
    const slug = uniqueSlug("bak");
    const created = await createProject(db, {
      slug,
      title: "Backup target",
      rootPath: "/workspace/bak",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const document = await exportBackup(db);
    expect(document.format).toBe(BACKUP_FORMAT);
    expect(document.tables.projects.some((row) => row.slug === slug)).toBe(true);
    const sqlDump = backupToSql(document);
    expect(sqlDump).toContain(BACKUP_FORMAT);
    expect(sqlDump).toContain(slug);

    const parsed = parseBackupJson(JSON.stringify(document));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    await restoreBackup(db, parsed);
    const listed = await listProjects(db);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.some((project) => project.slug === slug)).toBe(true);
    const loaded = await getProject(db, created.value.id);
    expect(loaded.ok).toBe(true);
  });
});
