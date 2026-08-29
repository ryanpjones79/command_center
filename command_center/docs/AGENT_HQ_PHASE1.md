# RyanOS Agent HQ — Phase 1 architecture

## Goals and non-goals

Phase 1 makes the existing RyanOS application the durable control plane for an autonomous portfolio of AI-managed projects. It adds machine-work orchestration, independent QA, deterministic safety policy, owner decisions, and an owner operating view.

It does not add a second application, task system, project database, or local runner. It does not send external messages, spend money, buy inventory, deploy production, merge code, expose a shell, invoke Codex, or implement SMS/Twilio.

## Existing architecture reused

- Next.js 15 App Router and server actions
- credentials/JWT authentication through NextAuth
- `requireUser()` and `userId` ownership checks
- `ExecutionDomain` for areas
- `ExecutionProject` for durable project identity
- `ExecutionTask` for human work
- Prisma with SQLite locally and PostgreSQL in hosted environments
- Railway cron polling through a bearer-protected Next.js route
- existing cards, badges, buttons, app shell, project maintenance view, and responsive navigation

## Entity model

`AgentProjectConfig` is a one-to-one extension of `ExecutionProject`; it never duplicates the project. It stores objective, optional KPI, bottleneck, PM charter, policies, WIP, health, scheduling, optional workspace/spend/action configuration, and the scheduler lease.

`AgentWorkItem` is the machine-work layer. It supports parent/child decomposition, business value, acceptance criteria, role, action category, attempts, evidence, external provider/thread/run identifiers, future workspace/repository claims, heartbeats, and leases.

`AgentRun` records each worker or QA attempt separately. It stores operational summaries, evidence, errors, structured outcomes, retry relationships, provider/model/executor identifiers, test results, and optional code-delivery identifiers. It never stores hidden reasoning.

`AgentDecision` is the durable NEED RYAN contract. Choices are stored as JSON text for SQLite/PostgreSQL parity. Resolutions record the selected choice and resulting action. A decision cannot convert a deterministic `DENY` into an approval.

`AgentEvent` is append-only operational history. Services create new rows and never update or delete event content. Idempotency keys prevent duplicate events after repeated scheduler calls.

Every new entity carries `userId` and all interactive reads/writes are user-scoped.

## Work-item state machine

States:

`QUEUED → PLANNING → RUNNING → VERIFYING → DONE`

Bounded alternate paths:

- execution or QA gap: `RUNNING/VERIFYING → RETRY → PLANNING`
- consequential judgment: `PLANNING/VERIFYING → NEEDS_RYAN`
- owner asks for revision: `NEEDS_RYAN → QUEUED`
- owner approves completed bounded work: `NEEDS_RYAN → DONE`
- owner passes: `NEEDS_RYAN → PARKED`
- denied action or exhausted retries: `PLANNING/RUNNING/VERIFYING → FAILED`
- a parked item may be deliberately requeued

All other transitions throw before persistence. Terminal work cannot silently restart.

## Agent responsibilities and boundaries

### Chief Portfolio Agent

The `ChiefPortfolioAgent` interface inspects project objectives, KPIs, health, movement, review cadence, decisions, and WIP. The Phase 1 deterministic implementation flags stalled projects, WIP violations, due PM reviews, and attention requirements. It summarizes the portfolio but does not perform project-detail work.

### PM / GM

The reusable `ProjectManagerAgent` interface receives a charter, objective, KPI, bottleneck, policies, and existing work. It must select one bounded next action with business value and acceptance criteria. Deterministic profiles are included for CCHCS, SignalCare, and Rykas.

### Worker

`AgentWorker` receives a bounded plan, attempt number, and optional workspace identifier. Phase 1 uses a deterministic mock worker. It takes no external action and returns only an operational summary, evidence, structured outcome, provider/executor identifiers, and test outcome.

### QA

`AgentVerifier` returns `PASS`, `REPAIR`, or `ESCALATE`. `REPAIR` schedules a bounded retry only below `maxAttempts`. Exhaustion produces `FAILED`. `ESCALATE` creates NEED RYAN only when owner judgment is genuinely required.

## Deterministic policy engine

`lib/agent-policy.ts` is the single policy boundary. Outcomes are `ALLOW`, `REQUIRE_OWNER_APPROVAL`, or `DENY`. Unknown categories deny at runtime.

- normally allowed: read-only research, reversible repository work, PHI-free CCHCS project management
- owner gated: external communication, messages/email, spending, inventory, pricing, economic guardrails, offers, production deployment, account changes, binding commitments, personnel matters, CCHCS methodology/policy/executive/production-risk actions
- denied: destructive operations in this phase, credentials/secrets handling, PHI external transfer, CCHCS sensitive content outside an approved boundary

No prompt, model output, or recommended choice can override this code.

## CCHCS boundary

CCHCS orchestration is PHI-free by default. Safe scope includes project management, prioritization, decomposition, approved-input code work, QA, drafting, meeting preparation, status reconciliation, follow-up tracking, and non-sensitive research.

Personnel actions, material methodology decisions, policy statements, executive/external communications, professional commitments, production-risk work, sensitive healthcare content, and potential PHI leaving an approved boundary are owner-gated or denied. Phase 1 contains no cloud-model PHI pathway.

## WIP rules

The default limit is two significant active machine work items per configured project. Active means queued, planning, running, verifying, or retrying. The scheduler checks WIP before creating work. The Chief separately flags stored violations so manual or future-worker mistakes stay visible.

## Scheduler and idempotency

Railway continues outbound cron triggering. `/api/cron/agents` uses the existing `CRON_SECRET` pattern.

Each cycle:

1. finds enabled, unpaused projects due for review;
2. atomically claims the project configuration with a lease token and expiry;
3. enforces WIP;
4. runs deterministic PM planning;
5. creates or reuses work by `projectId + idempotencyKey`;
6. evaluates deterministic policy;
7. persists a worker run and mock result;
8. persists an independent QA run;
9. completes, retries, fails, parks, or creates NEED RYAN;
10. appends operational events and releases the lease.

The due-review timestamp forms the work idempotency key. Run, decision, and event idempotency keys make repeated invocation safe. Atomic `updateMany` lease acquisition allows only one claimant and expired leases are recoverable.

## Initial project profiles

Seeding safely reuses an exact-name `ExecutionProject` for CCHCS, SignalCare, or Rykas. If no exact project exists, it creates the missing umbrella project once under the existing Work or Rykas domain. The unique `(userId, name)` project constraint and one-to-one configuration prevent duplicates. KPI fields remain blank until real measures exist.

The mock lifecycle intentionally produces a safe, verified internal artifact and then owner-gates the consequential next action:

- CCHCS: PHI-free methodology brief → QA → methodology approval
- SignalCare: prospect qualification → QA → outreach approval
- Rykas: opportunity verification → QA → capped purchase approval

## Agent HQ and existing project view

`/agent-hq` is an owner operating surface showing Chief status, portfolio counts, project cards, WIP, current work, completed outcomes, NEED RYAN, meaningful events, and parked/failed work. Decision cards contain context, upside, risk, exposure, recommendation, and fast choices without requiring raw run logs.

The existing `/projects` route now includes an Agent / Autonomy section on configured projects with charter controls, policies, WIP, current work, decisions, history, pause/resume, and PM review timestamps.

## Phase 2 local runner seam

The proposed sibling `/ryanos-agent-runner` remains unimplemented. `server/agent/runner-contract.ts` defines outbound-polling contracts for claim, heartbeat, result submission, and release. The durable tables already include executor, provider, external thread/run, workspace/repository, claim token, lease, and heartbeat fields.

The runner should:

1. authenticate to RyanOS with a runner-specific credential;
2. poll outbound and claim one policy-eligible item;
3. receive bounded instructions and the authoritative policy outcome;
4. execute against approved local repositories, SQL Server, files, Codex, or scripts;
5. heartbeat and extend its lease;
6. submit operational result/evidence only;
7. release or complete the claim;
8. allow RyanOS to recover an abandoned expired lease.

Do not expose the Windows machine through inbound public networking.

## Phase 2 Codex seam

Codex will implement `AgentWorker`; it is not the orchestration model. Existing fields support provider/model, executor, Codex thread ID, external run ID, workspace/repository, result/evidence, test outcome, commit, PR, QA feedback, retry lineage, and resumable work. Policy evaluation occurs before dispatch and again before any consequential follow-up action.

## Future SMS / Chief seam

A future Twilio adapter should translate natural-language questions into authenticated read operations and consequential replies into `AgentDecision` resolutions. “What needs me?”, project-status questions, pause requests, and accomplishment summaries read the same durable control-plane state. Money, external communication, destructive work, and other consequential approvals require transaction-specific confirmation tied to one pending decision. SMS text is never the system of record.

## Deployment, rollback, and operations

- Local SQLite: additive migration under `prisma/migrations/20260829000000_add_agent_hq_phase1` and schema validation/generation.
- Hosted PostgreSQL: both Prisma schemas are aligned; the current Railway/Netlify/Vercel bootstrap still uses `prisma db push`. An equivalent reviewed PostgreSQL SQL migration is checked in under `prisma/postgres-migrations/` for a future `migrate deploy` cutover.
- Railway cron now triggers Daily Brief and Agent HQ endpoints every 15 minutes. A matching Netlify scheduled function exists.
- Rollback is operationally safe by pausing all agent configurations or disabling the agent cron while retaining durable history. Do not drop agent tables as a routine rollback.
- Phase 1 workers are deterministic and incur no model cost.

## Verification

`tests/agent-hq-phase1.test.ts` uses an isolated SQLite database and covers transitions, policy outcomes, CCHCS restrictions, three seeded lifecycles, persistence, owner decisions, user isolation, pause/resume, WIP, retries, max-attempt exhaustion, event history, and duplicate scheduler invocation.

`scripts/simulate-agent-lifecycle.ts` creates a temporary simulation user, runs all three lifecycles, resolves the recommended owner choices, prints the durable outcomes, and deletes only that temporary user.
