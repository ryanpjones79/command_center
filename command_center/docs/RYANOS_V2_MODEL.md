# RyanOS v2 model

Goal: make it easy to do the right thing. Capture once, trust it to come back at the right time, open RyanOS and find a feasible next action already prepared.

## One persistent action

Every commitment is one `ExecutionTask` from arrival to outcome. Inbox, Today, Now, Projects and Progress all read the same rows.

| Concern | Field(s) |
|---|---|
| Stable source identity | `integrationSourceKey` = `SYSTEM:sourceId`, unique per user (same name and uniqueness as the task-connector work, so both converge) |
| Source and original reference | `sourceSystem`, `sourceKind` (ACTION, INCIDENT, OFFER), `sourceUrl` (exact record) |
| Source state, separate from local handling | `sourceState` (OPEN, RESOLVED, GONE, UNKNOWN), `sourceObservedAt`, `sourceCheckedAt` vs `status` and `whenBucket` |
| What done means | `doneWhen` |
| Deadline / schedule / review (all distinct) | `dueDate` / `scheduledStart` and `scheduledEnd` / `followUpDate` |
| Opportunity expiry | `expiresAt` (never extended by scheduling later) |
| Effort | `remainingMinutes` (kept intact through interruptions) |
| Owner confirmation vs source verification | `localConfirmedAt` vs `sourceVerifiedAt` |
| Successor | `successorTaskId` holds the successor's task id or integration key |
| Needs judgment (Inbox badge) | `needsJudgment` |
| History | `ExecutionTaskEvent` (ARRIVED, SOURCE_UPDATED, SOURCE_VERIFIED, REOPENED, SCHEDULED, EXTENDED, INTERRUPTED, POSTPONED, DONE, INSPECTED, ACTIVATED, DISPLACED, CAPTURED, TRIAGED, KEPT_AS_REFERENCE) |

### Intake rules (`lib/v2/source-events.ts`, `server/v2/ingest.ts`)
- A new key creates one task. A concurrent duplicate insert falls back to an update, so retries and overlapping syncs never duplicate.
- Refreshes update source-owned fields only. The local schedule and handling are kept.
- An older observation than the stored one is ignored.
- Once handled locally (DONE or DROPPED), an item comes back only on an explicit `reopen` or a changed obligation fingerprint (kind, title, done-when, due, expiry, revision). A new poll timestamp alone never reopens it.
- `RESOLVED` records source verification and closes the item.
- `GONE` and `UNKNOWN` never complete anything. A failing source is recorded in `SourceSync` and shown as unknown.
- CCHCS events are rejected before storage if they look like patient information.

### Outcomes (`server/v2/outcomes.ts`)
- **Done** records owner confirmation.
- **Incidents** go to WAITING ("source recovery not reported") until the source reports RESOLVED.
- **Known successor** is unblocked and moved to today.
- **Last step with no successor** flags the project's missing next step.
- **Goal results** are never written by task completion.

## Scheduling (`lib/v2/scheduler.ts`, `server/v2/schedule-service.ts`)
- **Context windows:** DESK and PHONE run in work hours on weekdays. ERRAND runs 9:00–18:00 with 15-minute travel padding. HOME runs in the evening, or daytime on weekends. Anything else runs 7:00 until the day's end.
- **Constraints:** meetings (read-only calendar), protected Family/Kids/Health blocks, deadline and expiry, and the daily interruption buffer, which is preferred to stay free.
- **When nothing fits:** a CONFLICT lists exactly which movable blocks would be displaced. Protected time is never offered. Displacing needs the exact confirmed set; displaced blocks keep their minutes and return to today's queue.
- **Locking:** booking re-checks inside a transaction holding a per-user lock (Postgres advisory lock), so concurrent requests can't overlap.
- **+15:** names any clash instead of overlapping.
- **Interrupted:** keeps the remainder.
- **Postpone:** always picks a dated destination. The 3rd postponement asks "still worth doing?".
- **Timezone:** `UserSettings.timeZone`, default America/Los_Angeles, with DST-safe helpers in `lib/v2/zoned-time.ts`.

## Projects and progress
- **Coverage** (`lib/v2/coverage.ts`) is derived, never maintained by hand. The states are:
  - covered
  - needs time
  - needs a next action
  - waiting, or waiting overdue
  - monitoring (healthy; no work is manufactured)
  - paused
  - open obligations (source-complete or closed, but tasks still open)
  - complete
  - closed
- **Last real progress** is the latest completion or source verification. Rescheduling and edits don't count.
- **Weekly attention** (`ProjectAttention`) is planned hours per selected project. Selected projects with nothing booked this week are flagged.
- **Goals** (`Goal`, `GoalResult`, `lib/v2/progress.ts`):
  - One owner per goal: SOURCE goals are edited in their app (RyanOS links there); RYANOS goals are edited here.
  - Results carry period, evidence (SOURCE_VERIFIED or OWNER_CONFIRMED) and freshness.
  - Missing data shows as UNKNOWN; data from a failing source shows as HISTORICAL. Neither is ever zero or green.
  - A previous period's confirmation is never carried into the current one.
  - Outcome, action and constraint measures are kept separate.

## Day flow
- **Morning launch** (`server/v2/plan.ts`) proposes, in order:
  1. protected time
  2. items due or expiring within 2 days
  3. today's commitments
  4. one next action per selected project

  It works around meetings and keeps the buffer. Items that don't fit are listed with a reason. Accept books each slot, re-checking under the lock.
- **Now** shows one dominant surface: the current block, or an ended block to close out, or one feasible recommendation that fits before the next boundary (keeping the buffer is valid). Exceptions fold into one line.
- **Shutdown** (`server/v2/shutdown.ts`) settles today's unfinished commitments, lists what can't wait and what makes tomorrow unreliable, and sends new captures to a dated review batch.
- **Capture** (`server/v2/capture.ts`) needs only the content:
  - one task per line
  - review this evening, or tomorrow morning if captured late
  - an honest receipt, and Undo for 10 minutes
  - photos stored as-is and never read automatically
  - text checked for patient information

## Migration and deploy notes
- **Schema change is additive only:** new nullable columns, columns with defaults, new tables and new indexes. Postgres SQL is in `prisma/postgres-migrations/20261120000000_ryanos_v2_action_model.sql`; SQLite is in `prisma/migrations/20261120000000_ryanos_v2_action_model`.
- **Production applies schema automatically.** The Railway `command_center` service runs `railway:web:predeploy` = `prisma db push` + seed on **every deploy** of its branch (`feat/agent-hq-phase2`). Merging v2 there would apply this schema to production immediately. The change is additive, so `db push` needs no data-loss flag, but take a database backup first.
- **Merging with the task-connector work:** the uncommitted work in the main checkout adds the same `integrationSourceKey` column and `@@unique([userId, integrationSourceKey])`. When both land, keep one copy of each in both schema files.
- **Pre-existing test failure:** `tests/usability-refinement.test.ts` ("adds Read to Daily Brief…") fails when files are checked out with CRLF line endings (it matches `\n` in source text). It is not related to v2.
