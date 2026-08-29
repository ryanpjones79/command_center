# RyanOS Agent HQ Phase 2A — real safe autonomy

## Architecture and boundaries

Phase 2A extends, rather than replaces, Phase 1. `command_center/` remains the authenticated Next.js control plane and Prisma database remains the system of record. `ExecutionProject` remains project identity and `ExecutionTask` remains human work. Machine work remains `AgentWorkItem`; the sibling `ryanos-agent-runner/` is an outbound-polling Windows executor with no database connection and no inbound public listener.

Modes are explicit: `SIMULATION` uses deterministic Phase 1 PM/worker/QA adapters, `LIVE_INTERNAL` permits real structured planning plus registered local repository execution, and pausing disables new project review. External messages, purchases, price/offer changes, production deployment, destructive actions, credentials, and unrestricted shell remain unavailable.

## Authorization is not execution

`AgentDecision` records Ryan's choice. A transaction-specific `AgentActionRequest` records one exact proposed side effect, payload fingerprint, bounds, amount, expiry, authorization, execution, verification, and evidence. Approval transitions the action and originating work to `AWAITING_EXECUTION`; it never sets either to completed. SignalCare outreach and Rykas purchase approvals therefore remain visibly authorized but unexecuted until a future eligible executor proves the actual action. Authorization is one-time and cannot override deterministic `DENY`.

## Model adapters and cost controls

Deterministic Chief/PM/QA adapters remain the default. `ModelChiefPortfolioAgent` and `ModelProjectManagerAgent` call the Responses API only when `FEATURE_AGENT_MODELS=true` and validate strict structured output with Zod. Unknown project IDs, capabilities, policy categories, and malformed JSON fail safely. Environment settings select Chief/PM/QA models and cap model invocations per cycle; model/provider metadata is stored on operational `AgentRun` records. Prompts prohibit make-work and tell PMs to choose WAIT/PARK when no valuable bounded action exists.

## Runner API and authentication

`POST /api/runner/{claim,heartbeat,result,failure,release}` accepts runner-specific HMAC authentication, not NextAuth. The canonical signature covers method, path, timestamp, nonce/request ID, and body hash. Persistent unique nonces reject replay, timestamp skew is limited, and the registered key ID maps to one RyanOS user. Secrets are environment-only. Claim responses contain only bounded work, acceptance criteria, registered workspace identifier, capability, sandbox/network policy, lease, and resumable thread ID.

Claims use conditional updates so concurrent pollers cannot claim the same item. Heartbeats extend five-minute leases. Expired leases are reclaimable. Results are schema-validated and duplicate successful submissions are idempotent. PASS produces `READY_FOR_REVIEW`, never merge or deployment, and makes the PM due immediately for autonomous continuation. REPAIR retries within `maxAttempts`; exhaustion fails; ESCALATE remains durable NEED RYAN.

## Codex and independent QA

The official `@openai/codex-sdk` exists only in the local runner. It starts or resumes a persisted thread, uses an explicit Git working directory, blocks network, passes a minimal environment allowlist, uses `workspace-write` for implementation and `read-only` for review, does not skip Git checks, and fails closed under `approvalPolicy: never`. Codex receives a bounded task package and strict structured-result schema. Thread ID, model, branch, worktree, diff/test evidence, and optional commit are returned to RyanOS.

Mutable jobs require a clean canonical Git repository and get a dedicated `agent/<project-slug>/<work-item-id>` branch/worktree. Human dirty work is never touched. Successful worktrees remain reviewable. Independent deterministic QA inspects actual Git changes and executes only test commands registered by the owner in the local workspace registry; sensitive file changes escalate. Codex self-assessment is never final QA.

## CCHCS

CCHCS remains PHI-free by default. The registry denies `CCHCS_SENSITIVE` entirely and permits only explicitly registered `CCHCS_PHI_FREE` repositories. No local SQL or blanket filesystem capability exists. Network is off, unrelated environment credentials are withheld, and sensitive content, personnel, methodology, policy, executive communications, professional commitments, and production risk remain denied or owner-gated.

## Deployment and rollback

Apply the aligned SQLite/PostgreSQL migrations, configure model and runner environment variables, register a runner key ID for the correct owner, and keep all new kill switches false until validation. Deploying Railway does not start the Windows runner. Roll back operationally by setting `FEATURE_AGENT_MODELS=false`, `FEATURE_RUNNER_EXECUTION=false`, `FEATURE_CODEX_EXECUTION=false`, or pausing projects; active leases expire without deleting durable history. No production deploy or automatic merge is part of Phase 2A.
