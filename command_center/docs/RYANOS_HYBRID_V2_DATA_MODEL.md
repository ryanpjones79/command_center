# RyanOS Hybrid V2 Data Model

Status: planning specification only
Created: 2026-08-03

This document proposes the smallest practical data-model additions for RyanOS Hybrid V2. Do not create migrations from this document until the implementation phase is explicitly approved.

## Data Model Principles

- Preserve all existing RyanOS execution data.
- Preserve `ExecutionTask` as the time-block entity.
- Preserve current task/project recurrence, scheduling, and project-control fields.
- Prefer additive schema changes.
- Do not delete or merge overlapping concepts without a migration plan.
- Do not store full paper reflections.
- Do not turn reading or spirituality into scores.
- Derived values should be computed in services, not stored.
- Both `prisma/schema.prisma` and `prisma/schema.postgres.prisma` must stay in sync when implementation begins.

## Existing Relevant Entities

### User

Current purpose:

- Authenticated owner for all app data.

Important existing fields:

- `id`
- `email`
- `passwordHash`
- `name`
- timestamps

Relationships:

- `settings`
- `executionDomains`
- `executionProjects`
- `executionTasks`
- `dailyPlans`
- `queueItems`
- `pipelineActions`
- `rykasDays`
- `parkedIdeas`
- `weeklyResets`
- legacy market models

Hybrid V2 impact:

- New notebook and reading entities should belong to `User`.

### ExecutionDomain

Current purpose:

- Life/work area, currently called domain.

Important existing fields:

- `id`
- `userId`
- `name`
- `slug`
- `description`
- `isDefault`

Relationships:

- Has many `ExecutionProject`.
- Has many `ExecutionTask`.

Hybrid V2 impact:

- Reuse for NotebookEntryIndex area linking.
- UI may rename to "Area" while database remains `ExecutionDomain`.

### ExecutionProject

Current purpose:

- Larger initiatives that support weekly review and task organization.

Important existing fields:

- `id`
- `userId`
- `domainId`
- `name`
- `status`
- `activeStatus`
- `weeklyFocus`
- `priority`
- `nextAction`
- `waitingOn`
- `blocked`
- `note`
- `lastReviewedAt`

Relationships:

- Belongs to `ExecutionDomain`.
- Has many `ExecutionTask`.

Hybrid V2 impact:

- Reuse for NotebookEntryIndex project linking.
- Preserve Project Control.

### ExecutionTask

Current purpose:

- Task/action entity and internal time-block entity.

Important existing fields:

- `id`
- `userId`
- `domainId`
- `projectId`
- `title`
- `type`
- `estimatedDuration`
- `status`
- `priority`
- `whenBucket`
- `dueDate`
- `followUpDate`
- `waitingOn`
- `note`
- `source`
- `isBlocked`
- `pinToTodayUntilDone`
- `recurrenceFrequency`
- `recurrenceWeekdays`
- `recurrenceEndDate`
- `recurrenceParentId`
- `scheduledStart`
- `scheduledEnd`
- `blockType`
- `isNeedle`
- `isBuild`
- `recipient`
- `owedToLeadership`
- `shippedAt`
- timestamps
- `completedAt`

Hybrid V2 impact:

- Preserve as-is.
- Do not create a separate TimeBlock model.
- Use for commitments and actions, not thoughts.

### DailyPlan

Current purpose:

- Per-user, per-date RyanOS daily fields.

Existing fields:

- `id`
- `userId`
- `date`
- `needleMove`
- `ruleStep`
- `needleTaskId`
- `rykasDismissed`
- `shutdownNote`
- timestamps

Current uniqueness:

- Unique on `[userId, date]`.

Hybrid V2 proposed additions:

- `relationshipIntention String?`
- `wayOfBeing String?`
- `morningLaunchStatus String?`
- `paperSessionStartedAt DateTime?`
- `paperSessionCompletedAt DateTime?`
- `paperSessionSkippedAt DateTime?`
- `shutdownShipped String?`
- `shutdownStillOpen String?`
- `shutdownCompletedAt DateTime?`

Allowed `morningLaunchStatus` values:

- `not_started`
- `started`
- `completed`
- `skipped`

Why DailyPlan is preferred:

- Morning Launch, relationship intention, way of being, and shutdown are date-scoped daily state.
- This avoids a separate daily ritual model unless history requirements become more complex.

Backward compatibility:

- Existing `DailyPlan` rows remain valid with null new fields.

### QueueItem

Current purpose:

- 80% Queue item for ship/kill/park decisions.

Existing fields:

- `id`
- `userId`
- `title`
- `lane`
- `recipient`
- `nextAction`
- `status`
- `createdAt`
- `resolvedAt`

Hybrid V2 recommendation:

- Keep distinct from `ExecutionTask`.
- Use for almost-shippable loops and artifacts.
- Do not use for generic thoughts.
- Weekly Reset can surface unresolved queue items.

Possible future additions:

- `sourceNotebookEntryId String?`
- `projectId String?`

Only add these if Notebook Bridge needs direct promotion into the 80% Queue.

### PipelineAction

Current purpose:

- Pipeline action log.

Existing fields:

- `id`
- `userId`
- `date`
- `type`
- `withWhom`
- `note`
- `createdAt`

Hybrid V2 recommendation:

- Preserve unchanged.
- Pipeline remains a Work/Review support surface, not a notebook feature.

### RykasDay

Current purpose:

- Daily Rykas state.

Existing fields:

- `id`
- `userId`
- `date`
- `toShip`
- `offersDone`
- `listedCount`
- `sourced`
- `backlogAfter`
- `capOverride`

Hybrid V2 recommendation:

- Preserve unchanged for now.
- Continue using `backlogAfter` in Today guardrails.

### ParkedIdea

Current purpose:

- Ideas and possibilities intentionally not committed.

Existing fields:

- `id`
- `userId`
- `idea`
- `lane`
- `triggerCondition`
- `status`
- `renewals`
- `parkedAt`
- `touchedAt`

Hybrid V2 recommendation:

- Keep distinct from task `PARKING_LOT`.
- Use for possibilities, not committed actions.
- Library should expose Parked Ideas.

Possible future additions:

- `sourceNotebookEntryId String?`

### WeeklyReset

Current purpose:

- Weekly reset metrics and outcomes.

Existing fields:

- `id`
- `userId`
- `weekOf`
- `loopsShipped`
- `loopsKilled`
- `loopsParked`
- `conversations`
- `ships`
- `rykasBacklog`
- `overridesCount`
- `outcomes`
- `promotedIdeaId`
- `completedAt`

Existing uniqueness:

- Unique on `[userId, weekOf]`.

Hybrid V2 proposed additions:

- `paperReflectionStartedAt DateTime?`
- `paperReflectionCompletedAt DateTime?`
- `notebookProcessedAt DateTime?`
- `weekTheme String?`
- `guideGeneratedAt DateTime?`

Do not add:

- Full reflection text.
- Spiritual scores.
- Energy scores unless later proven useful.

### DailyBriefDispatch

Current purpose:

- Tracks Daily Brief email dispatch by date.

Hybrid V2 recommendation:

- Preserve while Daily Brief remains.
- If Daily Brief becomes an archive, add a separate archive table only if brief content needs to be retained.

### Legacy Market Entities

Entities:

- `UserSettings`
- `WatchlistTicker`
- `PriceBar`
- `FetchState`
- `SavedSignalFilter`

Hybrid V2 recommendation:

- Do not modify as part of Hybrid V2.
- If legacy market tools leave the repo, migrate these in a separate project.

### ContactLead

Current purpose:

- Local untracked Rykas marketing contact form persistence.

Hybrid V2 recommendation:

- Do not couple to RyanOS Hybrid.
- Prefer separate marketing app/repo if public Rykas site continues.

## Proposed New Entities

### Notebook

Purpose:

- Represent a physical notebook.

Fields:

```prisma
model Notebook {
  id          String   @id @default(cuid())
  userId      String
  title       String
  number      Int?
  startedAt   DateTime?
  completedAt DateTime?
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries     NotebookEntryIndex[]

  @@unique([userId, number])
  @@index([userId, startedAt])
  @@index([userId, completedAt])
}
```

Notes:

- `number` is optional but useful for "Notebook 01".
- Unique `[userId, number]` should allow multiple nulls in Postgres; SQLite behavior should be checked before implementation.
- If null uniqueness creates cross-provider inconsistency, make `number` required or use title uniqueness instead.

### NotebookEntryIndex

Purpose:

- Minimal index pointing back to a physical notebook page.

Fields:

```prisma
model NotebookEntryIndex {
  id          String   @id @default(cuid())
  userId      String
  notebookId  String
  date        DateTime?
  pageNumber  Int
  title       String
  summary     String?
  domainId    String?
  projectId   String?
  entryType   String
  photoUrl    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  notebook    Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  domain      ExecutionDomain? @relation(fields: [domainId], references: [id], onDelete: SetNull)
  project     ExecutionProject? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([userId, date])
  @@index([userId, entryType])
  @@index([notebookId, pageNumber])
  @@index([domainId])
  @@index([projectId])
}
```

Allowed `entryType` values:

- `insight`
- `decision`
- `project_note`
- `spiritual_reflection`
- `idea`
- `meeting`
- `reference`

Why include `userId` even though notebook has user:

- Matches existing ownership patterns.
- Simplifies user-scoped queries and authorization.

### ReadingPath

Purpose:

- Track physical reading paths and current references.

Fields:

```prisma
model ReadingPath {
  id             String   @id @default(cuid())
  userId         String
  title          String
  sourceType     String   @default("book")
  currentRef     String?
  theme          String?
  lastReadAt     DateTime?
  savedInsight   String?
  isActive       Boolean  @default(false)
  sortOrder      Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  progress       ReadingProgress[]

  @@index([userId, isActive, sortOrder])
  @@unique([userId, title])
}
```

Allowed `sourceType` values:

- `book`
- `custom`
- `scripture`
- `essay`

Do not store long passages.

### ReadingProgress

Purpose:

- Optional history of reading references without streaks.

Fields:

```prisma
model ReadingProgress {
  id             String   @id @default(cuid())
  userId         String
  readingPathId  String
  readAt         DateTime @default(now())
  reference      String
  theme          String?
  savedInsight   String?

  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  readingPath    ReadingPath @relation(fields: [readingPathId], references: [id], onDelete: Cascade)

  @@index([userId, readAt])
  @@index([readingPathId, readAt])
}
```

Implementation note:

- This can be deferred. `ReadingPath.lastReadAt/currentRef/savedInsight` may be enough for first release.

### UserPreference Additions Or New RyanOsPreference

Current app uses `UserSettings` for market settings, not general app preferences.

Avoid polluting `UserSettings` further if market tools remain.

Recommended new model if preferences expand:

```prisma
model RyanOsPreference {
  id                    String   @id @default(cuid())
  userId                String   @unique
  howItWorksCollapsed   Boolean  @default(false)
  activeNotebookId      String?
  activeReadingPathId   String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

If avoiding a new model in first release:

- Store collapsed state in localStorage temporarily.
- Store active reading path through `ReadingPath.isActive`.
- Determine active notebook by most recent incomplete notebook.

## Existing Overlap Evaluation

### ParkedIdea Versus Task PARKING_LOT

Keep both.

Task `PARKING_LOT`:

- A real task/action that should not appear in Today right now.
- Can be filtered in Work.
- Has task metadata: priority, duration, status, due/follow-up, project.

`ParkedIdea`:

- A possibility that is not a commitment.
- Minimal fields.
- Lives in Library/Parking.
- Should not appear in Today task queue.

UI distinction:

- "Parked Tasks" for `ExecutionTask.whenBucket = PARKING_LOT`.
- "Parked Ideas" for `ParkedIdea`.

Migration:

- No migration initially.
- Later optional migration could convert old parking-lot tasks without due dates/status/project into ParkedIdeas, but only after manual review.

### QueueItem Versus ExecutionTask

Keep distinct.

QueueItem:

- 80% done loop.
- Must resolve to shipped/killed/parked.
- Has recipient and nextAction.

ExecutionTask:

- General action/commitment.
- Can be scheduled, recurring, waiting, pinned.

Migration:

- None initially.

### NotebookEntryIndex Versus ParkedIdea

Keep distinct.

NotebookEntryIndex:

- Points to where something lives on paper.
- May be spiritual reflection, meeting, insight, decision, reference.
- Not inherently a future action.

ParkedIdea:

- A future possibility intentionally held.

Bridge:

- Add optional `sourceNotebookEntryId` later to ParkedIdea if needed.

### Relationship Intention

Recommended storage:

- `DailyPlan.relationshipIntention String?`

Reason:

- It is daily, lightweight, and not a task.

Do not:

- Create a Relationship entity.
- Add CRM behavior.
- Convert relationship intention to follow-up automatically.

### Way Of Being

Recommended storage:

- `DailyPlan.wayOfBeing String?`

Reason:

- It is daily, short, and intentionally reflective.

Do not:

- Score it.
- Build habit/streak tracking.

### Morning Launch Completion

Recommended storage:

- `DailyPlan.morningLaunchStatus String?`
- `DailyPlan.paperSessionStartedAt DateTime?`
- `DailyPlan.paperSessionCompletedAt DateTime?`
- `DailyPlan.paperSessionSkippedAt DateTime?`

Reason:

- Per-day state.
- Minimal.
- No full reflection text.

### Shutdown History

Current storage:

- `DailyPlan.shutdownNote`

Recommended additions:

- `DailyPlan.shutdownShipped String?`
- `DailyPlan.shutdownStillOpen String?`
- `DailyPlan.shutdownCompletedAt DateTime?`

Reason:

- Daily shutdown history belongs with DailyPlan until requirements justify a separate model.

Alternative:

- `DailyShutdown` model.

Use only if:

- Multiple shutdown entries per day are needed.
- Rich review history emerges.
- Future audit/reporting requires it.

## Indexes And Uniqueness Rules

### DailyPlan

Existing:

- Unique `[userId, date]`.
- Index `[userId, date]`.

Keep.

### Notebook

Recommended:

- Unique `[userId, number]` if provider-safe.
- Index `[userId, startedAt]`.
- Index `[userId, completedAt]`.

### NotebookEntryIndex

Recommended:

- Index `[userId, date]`.
- Index `[userId, entryType]`.
- Index `[notebookId, pageNumber]`.
- Index `[domainId]`.
- Index `[projectId]`.

Uniqueness:

- Do not enforce unique page/title. Multiple entries can live on one page.

### ReadingPath

Recommended:

- Unique `[userId, title]`.
- Index `[userId, isActive, sortOrder]`.

Active path invariant:

- At most one active path per user is desirable but not trivial with Prisma across SQLite/Postgres.
- Enforce in server action by setting all others inactive when one is activated.

### ReadingProgress

Recommended:

- Index `[userId, readAt]`.
- Index `[readingPathId, readAt]`.

## Migration Strategy

Phase 1 model changes:

- Add nullable fields to `DailyPlan`.
- Add `Notebook` and `NotebookEntryIndex`.

Phase 2 model changes:

- Add `ReadingPath`.
- Optional `ReadingProgress`.
- Optional `RyanOsPreference`.

Phase 3 model changes:

- Add optional links from `ParkedIdea`, `QueueItem`, or `ExecutionTask` to `NotebookEntryIndex` only if real usage demands it.

Rules:

- Update both Prisma schema files in the same commit.
- Generate one migration per phase.
- Never alter/drop old fields in the same migration that introduces replacement fields.
- Backfill only additive defaults.
- Preserve all old rows.

## Backward Compatibility

Existing routes should continue to work if new fields are null:

- `/time-blocks`
- `/tasks`
- `/projects`
- `/weekly-review`
- `/daily-brief`
- `/dashboard` if tracked
- print routes

New features should tolerate:

- No DailyPlan for date yet.
- No active notebook.
- No notebook entries.
- No active reading path.
- No WeeklyReset for week.
- Existing tasks without blockType.
- Existing projects without recent review.

## Data That Must Never Be Lost

- User account and password hash.
- Execution domains.
- Execution projects.
- Execution tasks.
- Recurrence fields.
- ScheduledStart/scheduledEnd time blocks.
- Task completion history.
- Project Top 3 / active / parked states.
- DailyPlan needle moves and shutdown notes.
- Rykas backlog history.
- Queue items.
- Parked ideas.
- Weekly reset records.
- Daily Brief dispatch history while Daily Brief remains.
- Legacy market data until market tools are deliberately moved or archived.

## Service Layer Requirements

Add or extend services rather than embedding complex queries in pages:

- `server/execution-service.ts`: continue to own execution/project/task loaders.
- New `server/notebook-service.ts`: notebooks and notebook entry indexes.
- New `server/reading-service.ts`: reading paths and progress.
- New `server/review-service.ts`: daily shutdown history and weekly reset flow, possibly extracting from `execution-service.ts`.

Server actions:

- Use ownership checks through `requireUser()`.
- Validate enum-like string values.
- Validate short max lengths for notebook index title/summary.
- Detect PHI in notebook entry title/summary if project/work domains are used.
- Do not validate or store long spiritual/paper reflections.

## Open Data Questions

1. Should active notebook be explicit (`RyanOsPreference.activeNotebookId`) or inferred from the latest incomplete notebook?
2. Should ReadingProgress exist in first release, or is `ReadingPath.lastReadAt` enough?
3. Should NotebookEntryIndex support photos in first release?
4. Should notebook entries be allowed to link to completed projects?
5. Should Daily Brief archive store generated text, or only dispatch metadata?
6. Should root route/marketing separation happen before adding new data models?

