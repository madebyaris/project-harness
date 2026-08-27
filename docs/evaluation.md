# Evaluation

Paired runs. Same prompt, Project A then Project B, with and without this plugin. Token counts from Grok Bot are opaque, so record what the plugin actually controls plus whatever the dashboard shows.

## What success means

- Zero cross-project canary leakage
- Finite handoffs (store `budget_exceeded` if the lead loops)
- Research claims have source URLs and quotes
- Coding uses a fresh worker, a pstack brief, and the real project checks
- Token use is a measured before/after, not a promised percent

## Canaries

- Project A: `evals/canary-a.md`
- Project B: `evals/canary-b.md`

Prompt: store each canary with `/project`, then ask Project B a question that would be easier if it still knew Project A. Fail the run if `CANARY_ALPHA` appears in a Project B capsule or reply.

## Tasks

- Research: `evals/research.md`
- Management: `evals/management.md`
- Coding: `evals/coding.md`
- Usage log: `evals/usage.md`

## Plugin-controlled counters

Record per run:

- context bytes returned by `prepare_run`
- context item count and `truncated`
- handoff count / max
- revision count / max
- tool calls
- worker count
- backup bytes if you exported

If the Grok Bot dashboard shows usage, paste it next to those numbers. If it does not, say so. Do not invent tokens.
