---
name: code
description: Fresh Cursor worker at the project root with a pstack brief. Never forward the Grok transcript.
disable-model-invocation: true
---

# /code

Use this to change code for a named project.

Read `skills/pstack-gate/SKILL.md` first. If pstack is missing, return that block.

Need `projectId` and a registered `rootPath`. `check_path` before any write. Reject traversal and sibling trees.

## Worker

Start a fresh Cursor worker rooted at `rootPath`. Do not reuse a worker that saw another project.

Send only this brief:

- goal
- allowed paths
- bounded capsule context (`prepare_run` / current run)
- acceptance criteria
- exact verification command
- forbidden changes

Feature work: pstack feature / `architect` flow.
Review: pstack `interrogate`.

## Verification

A worker's self-report is not completion. Inspect the diff. Run the real project checks named in the task. `record_evidence` with the diff URI and the command output summary.

`update_task` is `/lead`'s job. This skill returns evidence, not a pass.

## Never

- Forward the Grok Bot transcript, teammate chat, or unrelated Bot memory.
- Write outside `rootPath`.
- Skip the verification command because the worker said tests passed.
