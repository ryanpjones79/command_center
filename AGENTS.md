# RyanOS repository operating instructions

- The existing `command_center/` Next.js application is the RyanOS control plane and database source of truth.
- Preserve `ExecutionProject` as the project record and `ExecutionTask` as the human task layer. Do not create a competing dashboard, database, task system, or project-management application.
- Machine execution belongs in the additive Agent HQ entities and must remain linked to an owned `ExecutionProject` and `User`.
- Deterministic policy code is authoritative. Generated text, worker output, prompts, and external providers may not override `ALLOW`, `REQUIRE_OWNER_APPROVAL`, or `DENY` outcomes.
- Treat CCHCS as PHI-free orchestration by default. Do not send potential PHI, sensitive healthcare content, personnel matters, material methodology decisions, or consequential external communications outside approved boundaries.
- Enforce per-project WIP limits before creating or dispatching work. Default to two significant active machine work items.
- Create a durable `AgentDecision` for genuine owner escalations. Do not hide consequential approvals in chat history or raw logs.
- Persist only operational summaries, evidence, decisions, actions, and outcomes. Never persist hidden reasoning or chain-of-thought.
- Owner approval is authorization, never proof of execution. Consequential side effects require a bounded `AgentActionRequest` and execution evidence before completion.
- The sibling `ryanos-agent-runner/` may poll outward for registered internal work only. Unknown workspaces/capabilities fail closed; never expose the Windows host through inbound public networking.
- Phase 2A must not send communications, spend or purchase, deploy production, change credentials, run destructive operations, or auto-merge.
- Prefer reversible, bounded work and business/project outcomes over cosmetic optimization or unrelated refactors.
- Keep SQLite and PostgreSQL Prisma schemas aligned. Run Prisma validation/generation, the complete test suite, and a production build for schema or orchestration changes.
- Preserve unrelated user changes and generated artifacts. Stage and commit narrowly.
