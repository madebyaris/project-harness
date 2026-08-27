# Project harness

Personal Grok Bot plugin. Remote Cloudflare Worker MCP. Project state lives in [TiDB Cloud Zero](https://zero.tidbcloud.com/), a disposable MySQL database.

It cuts token waste by loading a bounded capsule for one `projectId` instead of mixing chats. It cannot wipe Grok Bot's hidden memory, pick the routed model, or isolate the shared VM. Use a fresh Bot or chat per project even after install.

pstack is a separate plugin. This repo does not copy it. Research, coding, and review block if pstack is missing.

## Layout

- `plugin.json` / `mcp.json` — Grok Bot plugin manifests. Variables: `MCP_URL`, `MCP_TOKEN`.
- `worker/` — stateless Streamable HTTP MCP on `/mcp`.
- `skills/` — `/project` `/lead` `/research` `/code` `/drain`. Slash-only.
- `evals/` — canaries and scoring notes. Token reduction is measured, not promised.

## Quick start

1. `cd worker && npm install`
2. `npm run provision` — creates a TiDB Cloud Zero instance, writes `.tidb-zero.json` (gitignored).
3. `npm run migrate`
4. `npx wrangler secret put MCP_TOKEN` and `npx wrangler secret put TIDB_CONNECTION_STRING`, then `npx wrangler deploy`. Local: `npm run dev` (reads `worker/.dev.vars`).
5. Import this GitHub repo as a **Team marketplace** in Cursor/Grok Bot Plugins, install **project-harness**, then set `MCP_URL` and `MCP_TOKEN`. Local folder copies under `~/.cursor/plugins/local` do not appear in Marketplace search.
6. Install pstack separately.

Zero instances last up to 30 days unless you open the claim URL printed by `provision`. Download a dump before that:

```
npm run backup
```

SQL and JSON land in `backups/` (gitignored). Restore later with `npm run restore -- backups/project-harness-YYYY-MM-DD.sql`.

Authenticated HTTP: `GET /backup` and `GET /backup?format=json`. MCP tool: `export_backup`.

## Tests

```
npm test
```

Store tests provision or reuse TiDB Cloud Zero. They need network.

## Docs

- [Install and deploy](docs/install.md)
- [Evaluation](docs/evaluation.md)
- [Compatibility spike](docs/compatibility.md)
