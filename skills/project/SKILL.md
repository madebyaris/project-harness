---
name: project
description: Create or resume one named project capsule. Isolation key is projectId. Never mix projects.
disable-model-invocation: true
---

# /project

Use this when the user names a project, switches projects, or asks to store/load project facts.

## Isolation

There is no global active project. Every tool call takes `projectId`.

Grok Bot native memory is not a boundary. Recommend a fresh chat or Bot per project. This plugin cannot wipe that memory.

## Steps

1. `list_projects`. If the slug exists, `get_project`. Otherwise `create_project` with slug, title, and optional absolute `rootPath`.
2. `put_context` only for facts that belong to this `projectId`. Kind is `fact`, `constraint`, `artifact_ref`, `decision`, or `canary`.
3. `prepare_run` with the user's goal. Use the returned capsule. Do not search other projects. Do not dump the chat transcript into context.
4. Keep `projectId` and `runId` in subsequent `/lead`, `/research`, `/code`, and `/drain` calls.

## Capsule rules

- Retrieval names one `projectId`.
- Byte and item budgets on the run are hard caps.
- Provenance stays on every entry.
- If the capsule is truncated, say so. Do not fetch "the rest of memory".

## Never

- Put Project A facts into Project B.
- Call `prepare_run` without `projectId`.
- Forward unrelated Bot memory or another chat into the capsule.
