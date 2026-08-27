---
name: research
description: Bounded research for one project. Sources and quotes required. One synthesis.
disable-model-invocation: true
---

# /research

Use this for a research question on a named project.

Read `skills/pstack-gate/SKILL.md` first. If pstack is missing, return that block.

Need `projectId`. If missing, run `/project` first.

## Split

Break the question into independent sub-questions only. Cap fan-out at 4. Drop overlapping questions.

Codebase architecture or placement: pstack `how`.
Design history or "why is it like this": pstack `why`.
pstack `swarm` only when parallel coverage is cheaper than one pass. Say why, then cap N.

## Evidence

Every claim needs a source URL or file path and a short quote. If you cannot quote it, it is missing evidence.

Surface contradictions. Surface gaps. Do not paper over them.

## Synthesize once

One write-up after the evidence pass. Then one adversarial check (pstack `interrogate` when the finding will change a decision).

`record_evidence` on the current run. `put_context` only for durable project facts, still keyed by `projectId`.

## Never

- One Grok doing explorer and synthesizer in the same breath without a source list.
- Copying another project's research into this capsule.
- Treating search snippets as verified quotes.
