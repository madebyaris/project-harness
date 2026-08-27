---
name: pstack-gate
description: Required pstack check before research, coding, or adversarial review. Block if how, why, interrogate, or architect are missing.
disable-model-invocation: true
---

# pstack gate

This plugin does not copy pstack. It calls pstack skills that must already be installed.

## Required skills

- `how` for codebase architecture and placement questions
- `why` for design history
- `interrogate` for contested review (Act on / Consider / Noted / Dismissed)
- `architect` for non-trivial feature shape
- `swarm` only when independent slices earn the extra workers

## Check

Look for those skills from the pstack plugin. If any required skill is missing, stop.

Return:

```
blocked: pstack is not installed
install: add the pstack plugin, then rerun this command
do_not: invent a substitute research, coding, or review flow
```

Do not continue the parent skill after a block.
