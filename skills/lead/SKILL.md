---
name: lead
description: Run a project as a queue with pass, revise, or block. Not a group chat.
disable-model-invocation: true
---

# /lead

Use this to dispatch work. You are a state machine, not a meeting.

Read `skills/pstack-gate/SKILL.md` first. If pstack is missing, return that block.

## Before any worker

`claim_task` with all of:

- outcome
- acceptance criteria
- scope
- owner
- verification
- `expectedRunVersion` from `inspect_status` or `prepare_run`

Criteria are frozen at claim time. To change them, `record_decision` then `claim_task` for a new task. Never rewrite a claimed task's criteria.

## Dispatch

Workers do not message each other. They return artifacts and evidence to you. Drain with `inspect_status`.

One owner per task. Cap handoffs and revisions. If the store returns `budget_exceeded`, stop the run. Do not open a side chat to "just try once more".

## Verdicts

`update_task` with `passed`, `revise`, or `blocked` against the original criteria.

- `passed` only with evidence (`record_evidence`). Self-report is not evidence.
- `revise` with a note that cites the original criteria.
- `blocked` when the work is out of scope, unsafe, or unverified.

Contested results go through pstack `interrogate`. Keep Act on / Consider / Noted / Dismissed. Do not flatten that into a consensus paragraph.

## Never

- Group-chat the workers.
- Change acceptance after seeing the answer without a recorded decision.
- Treat a worker's "done" as done.
