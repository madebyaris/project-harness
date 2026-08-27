# Compatibility spike

Grok Bot exposes Cursor team marketplace plugins. Remote Streamable HTTP MCP is supported. The remaining live check is a private team plugin talking to the Cloudflare Worker with a bearer token.

Do not treat later layers as done until this list passes on a live Bot.

## Worker

- [x] `GET /healthz` returns `{ ok: true }`
- [x] `POST /mcp` without `Authorization` returns 401
- [x] `POST /mcp` with a wrong token returns 401
- [x] `initialize` + `tools/list` includes `harness_ping`, `create_project`, `export_backup`
- [x] `harness_ping` returns `store: "tidb-cloud-zero"`
- [x] `GET /backup` with the token downloads SQL
- [x] After `wrangler deploy`, `/readyz` still reads TiDB (state is not in the Worker)

## Grok Bot

- [ ] Team admin imports the GitHub repo and the plugin appears under **Team plugins**
- [ ] `MCP_URL` and `MCP_TOKEN` are accepted
- [ ] `harness_ping` works from the Bot
- [ ] `/project` creates Project A, `/project` on Project B does not see A's canary
- [ ] Fresh chat on the same Bot still hits TiDB (cloud VM reset does not drop projects)
- [ ] Mobile or another machine with the same plugin vars sees the same `list_projects`

## Failures that stop the spike

- Plugin install rejects `mcp.json` `streamable-http`
- Plugin ignores `Authorization`
- Worker auth is skipped
- TiDB unreachable from the Worker HTTP driver (`/readyz` 503)

If the private-plugin path fails, stop. Local stdio MCP will not survive Grok Bot's cloud VM.
