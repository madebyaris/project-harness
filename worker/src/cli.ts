import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  backupFilename,
  backupToSql,
  exportBackup,
  parseBackupJson,
  restoreBackup,
  restoreBackupSql,
} from "./backup.ts";
import {
  CACHE_PATH,
  loadCachedInstance,
  persistInstance,
  resolveConnectionString,
} from "./local-instance.ts";
import { applyMigrations } from "./migrate.ts";
import { openSql } from "./sql.ts";
import { provisionTidbZero } from "./tidb-zero.ts";

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(workerRoot, "..");
const backupsDir = join(repoRoot, "backups");
const migrationsDir = join(workerRoot, "migrations");

async function loadMigrationFiles() {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const files = [];
  for (const filename of names) {
    files.push({
      filename,
      body: await readFile(join(migrationsDir, filename), "utf8"),
    });
  }
  return files;
}

async function cmdProvision(): Promise<void> {
  const cached = await loadCachedInstance();
  const instance =
    cached === null
      ? await provisionTidbZero("project-harness").then(async (created) => {
          await persistInstance(created);
          return created;
        })
      : await resolveConnectionString({ provisionIfMissing: true, tag: "project-harness" });
  console.log(
    JSON.stringify(
      {
        id: instance.id,
        expiresAt: instance.expiresAt,
        claimUrl: instance.claimUrl,
        cache: CACHE_PATH,
      },
      null,
      2,
    ),
  );
}

async function cmdMigrate(): Promise<void> {
  const instance = await resolveConnectionString({
    provisionIfMissing: true,
    tag: "project-harness",
  });
  const sql = await openSql({ kind: "url", url: instance.connectionString });
  try {
    const files = await loadMigrationFiles();
    await applyMigrations(sql, files);
    console.log(JSON.stringify({ ok: true, applied: files.map((file) => file.filename) }));
  } finally {
    await sql.close();
  }
}

async function cmdBackup(): Promise<void> {
  const instance = await resolveConnectionString({
    provisionIfMissing: false,
    tag: "project-harness",
  });
  const sql = await openSql({ kind: "url", url: instance.connectionString });
  try {
    const document = await exportBackup(sql);
    await mkdir(backupsDir, { recursive: true });
    const sqlPath = join(backupsDir, backupFilename(document.exportedAtMs, "sql"));
    const jsonPath = join(backupsDir, backupFilename(document.exportedAtMs, "json"));
    await writeFile(sqlPath, backupToSql(document));
    await writeFile(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          ok: true,
          sql: sqlPath,
          json: jsonPath,
          expiresAt: instance.expiresAt,
          claimUrl: instance.claimUrl,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.close();
  }
}

async function cmdRestore(input: string | undefined): Promise<void> {
  if (input === undefined) {
    throw new Error("usage: npm run restore -- <backup.sql|backup.json>");
  }
  const path = resolve(input);
  const body = await readFile(path, "utf8");
  const instance = await resolveConnectionString({
    provisionIfMissing: true,
    tag: "project-harness-restore",
  });
  const sql = await openSql({ kind: "url", url: instance.connectionString });
  try {
    if (path.endsWith(".json")) {
      const document = parseBackupJson(body);
      if (document === null) {
        throw new Error("invalid_backup_json");
      }
      await restoreBackup(sql, document);
    } else {
      await restoreBackupSql(sql, body);
    }
    console.log(JSON.stringify({ ok: true, restored: path, targetId: instance.id }));
  } finally {
    await sql.close();
  }
}

const command = process.argv[2];
if (command === "provision") await cmdProvision();
else if (command === "migrate") await cmdMigrate();
else if (command === "backup") await cmdBackup();
else if (command === "restore") await cmdRestore(process.argv[3]);
else throw new Error("usage: provision | migrate | backup | restore");
