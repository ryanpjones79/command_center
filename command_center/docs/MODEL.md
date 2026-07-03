# docs/MODEL.md — RyanOS Data Model

Authoritative model spec. Derived values (weekly tallies, days-in-queue, backlog trend) are computed, never stored. All new models carry `userId` and follow existing auth/ownership patterns (`requireUser()`).

## Design decisions (binding)

1. **No `TimeBlock` model.** Time blocks remain `ExecutionTask` rows using `scheduledStart`/`scheduledEnd`. RyanOS extends `ExecutionTask` with nullable fields below. The grid code path is preserved.
2. **localStorage RyanOS fields migrate to Prisma.** `ryanos-execution:${dateKey}` keys are read once on first load after deploy (best-effort import into `DailyPlan`/`RykasDay`), then that code path is removed. No dual-write, no sync layer.
3. Legacy fields on `ExecutionTask` (`whenBucket`, recurrence, `priority`, project linkage) stay untouched and unused by RyanOS. Do not migrate or delete in this effort.
4. Legacy models (watchlist/market, `DailyBriefDispatch`, `ContactLead`) stay in schema for now; removal is a separate parked increment.
5. Week convention: the RyanOS week runs **Saturday 00:00 → Friday 23:59** local. `WeeklyReset.weekOf` = the Friday date. Pipeline counters and metrics compute over this window.
6. Both `prisma/schema.prisma` (SQLite dev) and `prisma/schema.postgres.prisma` (Neon prod) must receive identical model changes in the same commit. SQLite has no native enums — use `String` fields with values validated in server actions; document allowed values in comments.

## ExecutionTask — added fields (all nullable / defaulted, zero impact on legacy rows)

```prisma
// RyanOS extensions
blockType          String?   // 'cchcs' | 'pipeline' | 'rykas' | 'admin' | 'personal'
isNeedle           Boolean   @default(false) // max one true per user per day (enforce in action)
isBuild            Boolean   @default(false)
recipient          String?   // required by guardrail when isBuild = true
owedToLeadership   Boolean   @default(false)
shippedAt          DateTime? // block-level "this shipped" (distinct from completedAt)
```

Notes:
- `source: "RyanOS:<blockType>"` convention from `scheduleRyanOsBlockAction` remains valid; `blockType` becomes the queryable field going forward.
- "Required chips placed" = existence of a scheduled task for the date with `blockType` in ('pipeline','rykas'). Rykas-chip dismissal is recorded on `DailyPlan.rykasDismissed`.

## New models

```prisma
model DailyPlan {
  id            String    @id @default(cuid())
  userId        String
  date          DateTime  // date-only semantics; unique per user+date
  needleMove    String?   // past-tense result sentence
  ruleStep      Int?      // 1..4
  needleTaskId  String?   // ExecutionTask.id carrying the star
  rykasDismissed Boolean  @default(false)
  shutdownNote  String?   // "tomorrow's likely move"
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@unique([userId, date])
}

model QueueItem { // the 80% Queue
  id          String    @id @default(cuid())
  userId      String
  title       String
  lane        String    // 'cchcs' | 'signalcare' | 'rykas' | 'linkedin' | 'codex' | 'personal'
  recipient   String    // named human; 'me' valid only for lane = personal
  nextAction  String
  status      String    @default("queued") // 'queued' | 'shipped' | 'killed' | 'parked'
  createdAt   DateTime  @default(now())
  resolvedAt  DateTime?
}

model PipelineAction {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime
  type      String   // 'comment' | 'dm' | 'followup' | 'post' | 'conversation'
  withWhom  String?  // required when type = 'conversation' (enforce in action)
  note      String?
  createdAt DateTime @default(now())
}

model Touch { // deliberately crippled CRM — HARD CAP 30 rows per user (enforce in action)
  id            String    @id @default(cuid())
  userId        String
  name          String
  nextTouchDate DateTime?
  note          String?   // one line
  createdAt     DateTime  @default(now())
}

model RykasDay {
  id           String   @id @default(cuid())
  userId       String
  date         DateTime // unique per user+date
  toShip       String?  // newline-separated item names; cleared as shipped
  offersDone   Boolean  @default(false)
  listedCount  Int      @default(0)
  sourced      Boolean  @default(false)
  backlogAfter Int      @default(0) // authoritative backlog = latest RykasDay.backlogAfter
  capOverride  Boolean  @default(false)
  @@unique([userId, date])
}

model Pattern {
  id        String   @id @default(cuid())
  userId    String
  title     String
  shape     String   // 2–6 lines plain text
  type      String   // 'intake' | 'metric_logic' | 'exec_framing' | 'validation' | 'stakeholder_script' | 'workflow_design'
  canBecome String   // comma-separated of: 'post','proof','checklist','template'
  usedCount Int      @default(0)
  createdAt DateTime @default(now())
}

model ParkedIdea {
  id               String    @id @default(cuid())
  userId           String
  idea             String    // <= 2 lines, enforce ~200 chars in action
  lane             String
  triggerCondition String?   // flagged in UI when null
  status           String    @default("parked") // 'parked' | 'promoted' | 'deleted'
  renewals         Int       @default(0) // auto-delete on second renewal
  parkedAt         DateTime  @default(now())
  touchedAt        DateTime  @default(now()) // drives 90-day expiry
}

model WeeklyReset {
  id             String   @id @default(cuid())
  userId         String
  weekOf         DateTime // the Friday date; unique per user+weekOf
  loopsShipped   Int      @default(0)
  loopsKilled    Int      @default(0)
  loopsParked    Int      @default(0)
  conversations  Int      @default(0) // snapshot at completion
  ships          Int      @default(0)
  rykasBacklog   Int      @default(0)
  overridesCount Int      @default(0)
  outcomes       String   // JSON string: [{lane, text}] max 3, one per lane (validate in action)
  promotedIdeaId String?
  completedAt    DateTime?
  @@unique([userId, weekOf])
}

model GuardrailOverride {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime
  kind      String   // 'build_no_recipient' | 'queue_full' | 'eighty_interrupt' | 'rykas_cap'
  context   String?  // e.g. block title
  createdAt DateTime @default(now())
}
```

## Derived values (computed in `server/` services, never stored)

- **Conversations this week:** count `PipelineAction` where type='conversation' in current Sat→Fri window.
- **Ships this week:** `QueueItem.resolvedAt` in window with status='shipped' + `PipelineAction` type='post' in window + `ExecutionTask.shippedAt` in window. Killed queue items count toward "loops closed," not "ships."
- **Rykas backlog:** `backlogAfter` of the most recent `RykasDay` for the user.
- **Sourcing lock:** backlog >= 10.
- **Days in queue:** now − `QueueItem.createdAt`; amber at 7, red at 14.
- **Parking expiry:** `touchedAt` older than 90 days → "Expiring" section.
- **Rykas daily cap:** sum of scheduled minutes for `blockType='rykas'` on the date; >45 requires override (logged).

## Invariants (enforce in server actions, unit-test each)

1. One `isNeedle=true` scheduled task per user per date.
2. `PipelineAction.withWhom` required when type='conversation'.
3. `Touch` insert rejected at 30 rows with the graduation message.
4. `QueueItem` insert beyond 7 queued items requires override (logged).
5. Promotion of a `ParkedIdea` allowed only inside an open `WeeklyReset`, max one per reset, and only if loopsShipped+loopsKilled+loopsParked >= 1.
6. `ParkedIdea.renewals` reaching 2 → status='deleted'.
7. `WeeklyReset` outcomes: max 3, distinct lanes.
