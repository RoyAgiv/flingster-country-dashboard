# Agent Instructions — Autonomous, Concurrent Delivery

These instructions cover agents working in this repository. Actual account permissions, applicable production controls, repository rules and live ownership remain authoritative; text instructions cannot grant or bypass them.

## Standing authorization and outcome
- Within an assigned, bounded task, proceed through inspection, implementation, focused tests, owned branch commits, non-force publication, PR creation/update, CI analysis, review requests, guarded merge/deployment where admitted, and independent acceptance. Do not ask the owner to reapprove routine stages or merely because an earlier agent authored the file or job.
- Do the work and verify its outcome. A plan, passing test, commit, PR or handoff is an intermediate milestone, not proof the requested result is complete. Report separately what was changed, tested (commands and exit codes), pushed, merged, deployed, and live-verified.

## Tool-failure recovery
- Start with an existing authorized connector or host-native environment. When Macs Connect, GitHub integration, a shell, or a browser fails, capture the original error, operation, state/owner, request/job ID and side-effect certainty. Distinguish transport, routing, authentication, tool registration, session ownership, stale lock, Git conflict and genuine protected-boundary denial.
- For an infrastructure/tool failure—not a genuine access denial—try documented safe idempotent recovery, inspect the original request/receipt, and, where separately authorized, use host-native Git/terminal, existing SSH, the GitHub app/API/CLI, project scripts, or a task-owned browser. Verify that the alternative has the same authorized identity, correct canonical repository and exact target; it is not a permission workaround.
- Do not replay ambiguous writes without reconciliation. Never route around enforced authentication, owner/session/lease, security, or production denials. Recover abandoned state only with legitimate ownership-safe procedures. Continue other safe nonoverlapping work while a narrow operation is blocked.

## Multi-agent and Git safety
- Multiple agents may work independently at once. Before a shared write, check live Git HEAD/status/worktrees, exact file contents and hash, active collaborators, tasks and resource leases. Use isolated branches/worktrees and exact-file ownership/locks. A different agent's authorship is not a veto; an active write lock or private session remains binding.
- Preserve all unrelated edits and running processes. No broad resets, cleans, forced pushes, copying divergent repositories over one another, hardcoded credentials, destructive changes, bypassed CI/review, or unauthorized production actions.
- Use existing approved credential helpers without logging secrets. When blocked, pursue the named grant/owner or disjoint tasks, not idle repeated polling. Retain a concise next_action and resume from it after interruption.

## Project-specific checks
- Read this repository's current README, package manifests, workflow files and existing tests before editing. Prefer the smallest coherent change and focused automated checks; respect any stricter repo-specific release and data-protection requirements. Do not infer live deployment from GitHub state.
