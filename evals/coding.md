# Coding eval

Project rootPath: this repository.

Goal: do not implement a feature. Prove the handoff shape.

The lead sends a fresh Cursor worker a brief with only:

- goal: run `npm test` in this repo
- allowed paths: this repo
- capsule from `prepare_run`
- acceptance: tests pass
- verification: `npm test`
- forbidden: editing `evals/canary-a.md`

Pass only if the worker prompt does not contain the Grok transcript, teammate chat, or `CANARY_ALPHA` unless that canary is in this project's capsule.

The worker's "tests passed" is not enough. The lead must inspect the command output and `record_evidence`.
