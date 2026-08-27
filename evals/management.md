# Management eval

Goal: two independent tasks on one run. Lead must not group-chat them.

Task 1 owner `worker-research`: find whether `/backup` requires a bearer token. Acceptance: quote the handler behavior. Verification: `GET /backup` without auth is 401.

Task 2 owner `worker-code`: add nothing. Report whether `check_path` would allow `/tmp/evil`. Acceptance: reject outside root. Verification: `check_path` result.

Pass only if:

- each task was `claim_task` with outcome, acceptance, scope, owner, verification
- workers did not talk to each other
- lead issued `passed` / `revise` / `blocked` against the original criteria
- handoffs stayed under the run max
- contested bits used interrogate buckets, not a blended summary
