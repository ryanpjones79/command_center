# Agent HQ project tools V1 and production activation

This increment preserves the Phase 2A architecture. It adds three bounded read tools over existing RyanOS truth: `signalcare.pipeline.snapshot` reads SignalCare/Pipeline queue and activity records; `rykas.operations.snapshot` reads `RykasDay` and open Rykas tasks; `cchcs.commitments.snapshot` reads owned CCHCS tasks only. There is no replacement pipeline, sourcing database, arbitrary SQL, filesystem path, shell command, URL, credential, PHI, email, purchase, deploy, or merge capability.

Every tool has a stable identifier, profile eligibility, strict Zod input/output, read/write and sensitivity classification, deterministic policy category, timeout, call limit, and append-only audit event. Unknown tools deny. The PM receives validated tool output as operational evidence and may create bounded internal work, WAIT, PARK, or request an existing transaction-specific owner decision.

Repository work distinguishes verification from integration. `READY_FOR_REVIEW` sets `integrationStatus=PENDING_REVIEW`. Independent work may proceed, but a work item with `dependsOnWorkItemId` cannot be claimed until the dependency is explicitly marked `INTEGRATED` with canonical commit SHA and timestamp. Nothing auto-merges or calls review-ready work shipped.

Production defaults are all off: orchestration, model agents, runner execution, Codex execution, and project autonomy. Apply the PostgreSQL migrations (or the current reviewed `prisma db push` bootstrap), deploy the control plane, verify schema and Agent HQ, register the HMAC runner, observe heartbeat, enable model support, then enable only SignalCare in `LIVE_INTERNAL`, followed by runner/Codex. Rykas follows with read-only truth; CCHCS remains PHI-free and restricted.

Rollback: turn off runner/Codex/model/orchestration flags and pause all project configs. Leases expire safely and durable evidence remains. External communication, purchases, production deployment, destructive actions, credentials, price/offer changes, and automatic merge remain unavailable.
