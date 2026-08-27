---
name: drain
description: Compact status for one run, then finish it so the next capsule stays small.
disable-model-invocation: true
---

# /drain

Use this when a run is done or the user asks where things stand.

## Steps

1. `inspect_status` with `projectId` and `runId` if known.
2. Report compact facts only: run status, budgets used, task verdicts, evidence URIs, decisions. No transcript recap.
3. If the user is done, `finish_run` with `expectedRunVersion`.
4. Download a backup if the user wants a local copy: `export_backup` or `GET /backup`. TiDB Cloud Zero instances expire. A SQL file in `backups/` is what you keep.

## Next capsule

Finished runs are not live work. The next `/project` `prepare_run` should not reload this run's chatter. Durable facts belong in `put_context` on the project, not in the chat.

## Never

- Dump full task bodies into the user reply.
- Leave an open run that already hit `budget_exceeded` without saying so.
