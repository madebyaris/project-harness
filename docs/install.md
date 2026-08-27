# Install

## 1. TiDB Cloud Zero

The store is MySQL on [TiDB Cloud Zero](https://zero.tidbcloud.com/). No signup for a 30-day instance.

```
cd worker
npm install
npm run provision
npm run migrate
```

`provision` writes gitignored `.tidb-zero.json` at the repo root and `worker/.dev.vars` with `TIDB_CONNECTION_STRING`. It also prints `claimUrl` and `expiresAt`. Claim the instance if you want it after 30 days. There is no renew API.

Download a restorable dump whenever you care about the data:

```
npm run backup
```

Files go to `backups/`. Restore onto a new Zero instance or a claimed TiDB Cloud database:

```
npm run restore -- backups/project-harness-YYYY-MM-DD.sql
```

JSON works too: `npm run restore -- backups/project-harness-YYYY-MM-DD.json`.

Do not commit `.tidb-zero.json`, `.dev.vars`, or `backups/`.

## 2. Cloudflare Worker

Remote MCP has to be HTTPS. The Worker is stateless Streamable HTTP on `/mcp`. It talks to TiDB Cloud Zero over the [serverless HTTP driver](https://docs.pingcap.com/tidbcloud/integrate-tidbcloud-with-cloudflare/), not MySQL TCP.

Do not attach Hyperdrive. `wrangler hyperdrive create` against Zero fails with `AuthSwitchRequest` (code 2015). Direct `mysql2` TLS also fails in the isolate. CLI migrate, backup, and restore still use `mysql2` from Node.

Set secrets from `worker/.dev.vars` (do not paste them into chat):

```
npx wrangler secret put MCP_TOKEN
npx wrangler secret put TIDB_CONNECTION_STRING
npx wrangler deploy
```

Local:

```
npx wrangler dev
```

Wrangler loads `worker/.dev.vars` for `MCP_TOKEN` and `TIDB_CONNECTION_STRING`.

Checks:

- `GET /healthz` → `{ ok: true }` unauthenticated
- `GET /readyz` → store ping
- `POST /mcp` without `Authorization` → 401
- `GET /backup` with `Authorization: Bearer <token>` → SQL attachment

After a Worker deploy, state stays in TiDB, not in the isolate.

## 3. Grok Bot plugin

Marketplace search only lists Team/GitHub plugins, not `~/.cursor/plugins/local`. Import this repository as a **Team marketplace** (Cursor Dashboard → Plugins, or Grok Bot Plugins → Team plugins), then install **project-harness** and enable it on the Bot.

Set:

- `MCP_URL` — `https://project-harness.aris-41b.workers.dev/mcp`
- `MCP_TOKEN` — same value as the Wrangler secret (`worker/.dev.vars`, never commit it)

If the repo is private, complete GitHub auth so Grok Bot's computer can clone it.

`plugin.json` carries a top-level `variables` object. The public Agent Plugins 1.0 schema does not list that field. Grok Bot still reads it. Do not strip it to please a strict schema check.

Use one Bot or a fresh chat per project. The plugin cannot clear native memory.

## 4. pstack

Install pstack as its own plugin. Required skills: `how`, `why`, `interrogate`, `architect`. `swarm` is optional.

If those skills are missing, `/research`, `/code`, and `/lead` must return `blocked: pstack is not installed` and stop.
