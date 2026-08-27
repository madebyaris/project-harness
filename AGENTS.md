## Learned User Preferences

- Optimize for token waste and project isolation: load only the current project's capsule, never mix another project's context or dump all skills/memory into every chat.
- Grok Bot runs on cloud VMs, so harness memory must be remote and on-the-fly, not local SQLite.
- Integrate with the existing pstack plugin instead of copying it into this repo.
- Prefer objective lead/team gating and less slop in research and coding than Grok Bot's default harness.
- The plugin must work from both Cursor MCP and Grok Bot, not Cursor-only.
- A local plugin is managed from Cursor's installed components; to make it searchable in Grok Bot like BlockBite, import its GitHub repository as a team marketplace.

## Learned Workspace Facts

- This repo is **Project harness** (`project-harness`): a personal Grok Bot plugin with a stateless Cloudflare Worker MCP and project state in TiDB Cloud Zero.
- Skills are slash-only: `/project`, `/lead`, `/research`, `/code`, `/drain`. Research, coding, and review should block if pstack is missing.
- MCP is Streamable HTTP on `/mcp`; the Cursor Plugin gives `MCP_URL` a deployed-Worker default and requires users to configure `MCP_TOKEN`.
- The Worker talks to TiDB over the serverless HTTP driver, not MySQL TCP; do not attach Hyperdrive.
- TiDB Cloud Zero instances last up to 30 days unless claimed; backup/restore go through `npm run backup` / `npm run restore` into gitignored `backups/`.
- This plugin cannot wipe Grok Bot hidden memory, pick the routed model, or isolate the shared VM; use a fresh Bot or chat per project.
- Local development install path is `~/.cursor/plugins/local/project-harness`; team marketplace distribution comes from the private `madebyaris/project-harness` GitHub repository.
- Do not commit `.tidb-zero.json`, `worker/.dev.vars`, or `backups/`.
