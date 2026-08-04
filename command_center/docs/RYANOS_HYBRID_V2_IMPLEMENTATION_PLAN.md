# RyanOS Hybrid V2 Implementation Plan

Status: planning specification only
Created: 2026-08-03

This plan is intentionally phased. It preserves the current execution engine and avoids code/schema changes until a phase is explicitly selected for implementation.

## Phase 0: Repository And Route Stabilization

### Goal

Make the repository safe to change before Hybrid V2 feature work begins.

### Routes / Components Affected

- `/`
- `/time-blocks`
- `/dashboard`
- `/daily-brief`
- app shell/navigation
- public marketing routes if kept
- legacy market routes if kept

### Files Likely Affected

- `app/page.tsx`
- `app/layout.tsx`
- `components/layout/app-shell.tsx`
- `components/layout/root-shell.tsx`
- `README.md`
- `package.json`
- `package-lock.json`
- `.gitignore`
- route folders for local untracked marketing/dashboard work

### Data-Model Changes

- None.

### Migration Needs

- None.

### Acceptance Criteria

- Current Git worktree is understood and intentionally resolved.
- Root route owner is decided: RyanOS or public Rykas marketing.
- `/dashboard` status is decided: tracked Action Sheet route, hidden local experiment, or parked.
- App metadata matches the selected product.
- No working RyanOS route is accidentally broken.
- No unrelated generated artifacts are staged.

### Mobile Acceptance Criteria

- No mobile behavior changes required in Phase 0.
- Baseline mobile screenshots remain available for comparison.

### Regression Risks

- Breaking login redirects.
- Making public marketing routes override RyanOS unexpectedly.
- Losing Daily Brief/Action Sheet access through nav changes.
- Accidentally staging unrelated untracked work.

### Tests To Add

- Smoke test root redirect behavior.
- Smoke test authenticated access to `/time-blocks`, `/tasks`, `/projects`, `/weekly-review`, `/daily-brief`.

### Rollback Strategy

- Keep Phase 0 commits narrow and reversible.
- Do not mix feature work with route/metadata cleanup.

### Explicitly Out Of Scope

- New Hybrid V2 UI.
- Prisma schema changes.
- New notebook/reading models.
- Deleting legacy routes.

## Phase 1: Navigation And Information Architecture

### Goal

Convert the authenticated navigation conceptually to Today, Work, Review, Library while preserving old routes behind the scenes.

### Routes / Components Affected

- App shell.
- `/time-blocks`.
- `/tasks`.
- `/projects`.
- `/weekly-review`.
- `/daily-brief`.
- `/settings`.
- Potential new wrapper routes: `/work`, `/review`, `/library`.

### Files Likely Affected

- `components/layout/app-shell.tsx`
- `components/layout/root-shell.tsx`
- `app/time-blocks/page.tsx`
- `app/tasks/page.tsx`
- `app/projects/page.tsx`
- `app/weekly-review/page.tsx`
- `app/settings/page.tsx`
- New route files under `app/work`, `app/review`, `app/library` if aliases/wrappers are added.

### Data-Model Changes

- None.

### Migration Needs

- None.

### Acceptance Criteria

- Desktop primary nav shows Today, Work, Review, Library.
- Settings is behind a gear or secondary menu.
- Sign out remains accessible.
- Daily Brief and Action Sheet remain accessible through secondary links.
- Legacy market tools are hidden from primary RyanOS nav but not deleted.
- Existing direct URLs still work.

### Mobile Acceptance Criteria

- Mobile has one bottom navigation only.
- Duplicate horizontal desktop nav is removed or hidden on mobile.
- Bottom nav shows Today, Work, Review, Library.
- Capture action is reachable but not visually dominant.

### Regression Risks

- Existing user muscle memory around `/tasks` and `/weekly-review`.
- Action Sheet link currently points to `/`; changing nav could hide useful print workflow.
- Marketing/root conflict could make unauthenticated routing confusing.

### Tests To Add

- Component or Playwright smoke path for desktop nav.
- Mobile viewport smoke path confirming no duplicate horizontal nav.
- Route availability checks for old direct URLs.

### Rollback Strategy

- Restore previous `links` and `mobileLinks` arrays in `AppShell`.
- Keep old route files untouched.

### Explicitly Out Of Scope

- Redesigning Today.
- Notebook data.
- Weekly Reset wizard.
- Deleting any route.

## Phase 2: Morning Launch And Today Refinements

### Goal

Add Hybrid paper-to-digital ritual elements to the existing Today board without replacing the board.

### Routes / Components Affected

- `/time-blocks`.
- Existing Today board.
- Morning Card.
- Shutdown Panel.
- Time-block board mobile layout.

### Files Likely Affected

- `app/time-blocks/page.tsx`
- `components/execution/time-block-board.tsx`
- `components/execution/morning-card.tsx`
- `components/execution/shutdown-panel.tsx`
- `components/execution/time-block-grid.tsx`
- `components/execution/ryanos-block-palette.tsx`
- `app/time-blocks/actions.ts`
- `server/execution-service.ts`
- possibly new `components/execution/morning-launch-card.tsx`
- possibly new `components/execution/how-ryanos-works-card.tsx`

### Data-Model Changes

Recommended additions to `DailyPlan`:

- `relationshipIntention String?`
- `wayOfBeing String?`
- `morningLaunchStatus String?`
- `paperSessionStartedAt DateTime?`
- `paperSessionCompletedAt DateTime?`
- `paperSessionSkippedAt DateTime?`
- `shutdownShipped String?`
- `shutdownStillOpen String?`
- `shutdownCompletedAt DateTime?`

Optional:

- Use localStorage temporarily only for collapsed How RyanOS Works state if avoiding preferences model in this phase.

### Migration Needs

- One additive Prisma migration.
- Identical changes to SQLite and Postgres schemas.
- No backfill required.

### Acceptance Criteria

- Morning Launch appears above Today's Needle Move.
- Begin Paper Session shows the paper-session copy.
- Continue to Today collapses Morning Launch for that date.
- Skip for Today is available without guilt language.
- Relationship intention and way of being fields persist per date.
- Existing Needle Move persists.
- Existing date navigation still works.
- Existing drag/drop scheduling still works.
- Google Calendar remains read-only.
- Required blocks still place on the grid.
- Shutdown can persist shipped/open/tomorrow fields.

### Mobile Acceptance Criteria

- Morning Launch is first and readable.
- Needle Move, relationship intention, and way of being controls are stacked and one-hand usable.
- No duplicate top horizontal desktop nav.
- Timeline/agenda remains primary; desktop grid is not forced.
- Morning ritual can be completed in under ten minutes.

### Regression Risks

- Time-block board is a large client component and easy to destabilize.
- Autosave effects could create too many server calls.
- New daily fields could conflict with existing DailyPlan localStorage import.
- Overbuilding Morning Launch into a checklist.

### Tests To Add

- Unit test DailyPlan status transition helper: not_started -> started -> completed/skipped.
- Unit test no-work-block wording remains stable.
- Playwright happy path: login -> Today -> Begin Paper Session -> Continue -> enter Needle Move -> place Pipeline block -> shutdown.
- Mobile Playwright check for no duplicate nav.

### Rollback Strategy

- Feature flag or isolate Morning Launch behind a component that can be hidden.
- Keep existing MorningCard fields intact.
- Database migration is additive and can remain even if UI is rolled back.

### Explicitly Out Of Scope

- Notebook index.
- Reading path persistence.
- Google Calendar writeback.
- Calendar sync.
- AI-generated reflections.
- OCR.

## Phase 3: Notebook Bridge And Library

### Goal

Create a lightweight Library surface for indexing physical notebook entries and finding them later.

### Routes / Components Affected

- `/library`
- `/library/notebooks`
- `/library/parking`
- Potential project detail/task detail link surfaces.

### Files Likely Affected

- New `app/library/page.tsx`
- New `app/library/notebooks/page.tsx`
- New `app/library/parking/page.tsx`
- New `components/library/notebook-form.tsx`
- New `components/library/notebook-entry-form.tsx`
- New `components/library/notebook-entry-list.tsx`
- New `server/notebook-service.ts`
- New `app/library/actions.ts`
- `server/execution-service.ts` if project-linked entries appear in Project Control
- `prisma/schema.prisma`
- `prisma/schema.postgres.prisma`

### Data-Model Changes

Add:

- `Notebook`
- `NotebookEntryIndex`

Optional later:

- `ParkedIdea.sourceNotebookEntryId`
- `QueueItem.sourceNotebookEntryId`

### Migration Needs

- One additive Prisma migration for Notebook and NotebookEntryIndex.
- No migration of existing notes.

### Acceptance Criteria

- User can create a notebook.
- User can index a notebook page in under thirty seconds.
- Entry requires notebook, page number, title, and type.
- Summary is optional.
- Entry can optionally link to domain and project.
- Library can search/filter entries.
- Project-linked entries are discoverable from Library.
- No full transcription is required.

### Mobile Acceptance Criteria

- Index form is one-column and thumb-friendly.
- Save action is visible without hunting.
- Search/filter controls do not create horizontal overflow.
- Capture can send an idea to ParkedIdea without opening task maintenance.

### Regression Risks

- Users may treat NotebookEntryIndex as a digital journal if fields are too large.
- Adding photos/storage too early can expand scope.
- Project links can tempt automatic task creation.

### Tests To Add

- Unit test entry type validation.
- Unit test notebook ownership checks.
- Playwright path: Library -> create notebook -> index entry -> search by title -> link to project.

### Rollback Strategy

- Keep routes isolated under `/library`.
- Additive tables can remain unused if UI is rolled back.

### Explicitly Out Of Scope

- OCR.
- Photo upload.
- AI summary.
- Rich text.
- Tags/folders.
- Auto task creation from notebook entries.

## Phase 4: Guided Weekly Reset

### Goal

Evolve current Project Control into a two-phase paper-first Weekly Reset while preserving its intelligence.

### Routes / Components Affected

- `/weekly-review`
- `/review`
- `/review/weekly-reset`
- Project Control cards.
- Task Health rows.

### Files Likely Affected

- `app/weekly-review/page.tsx`
- New `app/review/page.tsx`
- New `app/review/weekly-reset/page.tsx` if using new route
- New `components/review/weekly-reset-wizard.tsx`
- New `components/review/project-control.tsx`
- `server/execution-service.ts`
- New `server/review-service.ts`
- `app/execution-actions.ts`
- New `app/review/actions.ts`
- Prisma schema files if WeeklyReset fields are added

### Data-Model Changes

Recommended additions to `WeeklyReset`:

- `paperReflectionStartedAt DateTime?`
- `paperReflectionCompletedAt DateTime?`
- `notebookProcessedAt DateTime?`
- `weekTheme String?`
- `guideGeneratedAt DateTime?`

Optional:

- No full reflection text.

### Migration Needs

- One additive Prisma migration if fields are added.

### Acceptance Criteria

- Weekly Reset starts with paper reflection phase.
- User can continue without typing reflection.
- Existing summary cards remain.
- Existing missing-next-action logic remains.
- Existing stale task/project logic remains.
- User can select or verify Top 3 projects.
- User can decide stale work: do, reschedule, return to project, park, release.
- Reset records completion.
- Weekly guide can be generated or printed as an output.

### Mobile Acceptance Criteria

- Wizard is readable one step at a time.
- Project cards are not cramped.
- Decisions are thumb-friendly.
- Reset can be paused and resumed.

### Regression Risks

- Replacing current Weekly Review instead of wrapping it.
- Losing task health visibility.
- Creating too much required input.
- Turning reset into a productivity score.

### Tests To Add

- Unit test stale work decision classification.
- Unit test WeeklyReset week key/window.
- Unit test Top 3 max rule if enforced.
- Playwright path: Review -> start reset -> paper phase -> resolve one prompt -> mark complete.

### Rollback Strategy

- Keep current Project Control component usable.
- Render old Weekly Review if reset wizard flag disabled.
- Additive schema changes can remain.

### Explicitly Out Of Scope

- Hard enforcement of every reset step unless later proven necessary.
- Charts.
- Streaks.
- Spiritual scoring.
- AI review summaries.

## Phase 5: Reading Paths And Principles

### Goal

Add restrained reading path tracking and the RyanOS Method guide in Library.

### Routes / Components Affected

- `/library/reading`
- `/library/principles`
- `/library/method`
- Morning Launch card on Today.

### Files Likely Affected

- New `app/library/reading/page.tsx`
- New `app/library/principles/page.tsx`
- New `app/library/method/page.tsx`
- New `components/library/reading-path-form.tsx`
- New `components/library/reading-path-card.tsx`
- New `server/reading-service.ts`
- New `app/library/reading/actions.ts`
- `components/execution/morning-launch-card.tsx`
- Prisma schema files

### Data-Model Changes

Add:

- `ReadingPath`

Optional:

- `ReadingProgress`
- `RyanOsPreference` if active path/collapsed states need user-level persistence.

### Migration Needs

- One additive migration.

### Acceptance Criteria

- User can create/edit reading path.
- User can set current reference.
- User can set optional theme.
- User can save optional one-line insight.
- Morning Launch shows active reading reference.
- App directs user to physical book.
- No long passage content is stored or displayed.
- RyanOS Method guide is available in Library.

### Mobile Acceptance Criteria

- Reading path card is compact.
- Morning Launch does not become a reading app.
- Method guide is readable and skimmable.

### Regression Risks

- Reading path becomes a streak tracker.
- Spiritual practice becomes performative.
- Copyright risk if passages are entered/displayed.

### Tests To Add

- Unit test active reading path server action sets only one active path.
- Validation test for saved insight max length.
- Playwright path: create reading path -> activate -> Today shows reference.

### Rollback Strategy

- Hide Library reading route.
- Keep data tables unused.

### Explicitly Out Of Scope

- Passage databases.
- External reading APIs.
- Copyrighted text display.
- Streaks.
- Scores.
- Long digital journaling.

## Phase 6: Optional Cleanup And Archival

### Goal

Remove or archive duplicate/legacy surfaces only after Hybrid V2 has proven itself in real use.

### Routes / Components Affected

- `/daily-brief`
- `/dashboard`
- `/print/action-sheet`
- legacy market routes
- public Rykas marketing routes
- `/settings`

### Files Likely Affected

- App route files for legacy routes.
- App shell.
- README.
- Deployment configs.
- Google services if Daily Brief is retired.
- Market services if market tools are moved.
- Marketing route/content/components if split out.

### Data-Model Changes

- None initially.
- Do not drop tables in this phase unless separate archival/export is complete.

### Migration Needs

- Prefer none.
- Data-removal migrations are out of scope until a separate archival plan exists.

### Acceptance Criteria

- Daily Brief future role is decided with evidence from use.
- Action Sheet future role is decided with evidence from use.
- Legacy market tools are either archived, hidden, or moved.
- Public Rykas marketing is either moved to separate repo/deployment or cleanly isolated.
- Primary RyanOS app has one coherent identity.

### Mobile Acceptance Criteria

- Mobile nav remains four primary destinations.
- No hidden legacy surface competes with Today.

### Regression Risks

- Removing a still-useful print workflow.
- Breaking scheduled Daily Brief email unexpectedly.
- Losing market or marketing data.

### Tests To Add

- Route redirect tests for archived routes.
- Smoke tests for preserved secondary routes.
- Data export validation if any tool is moved out.

### Rollback Strategy

- Hide before delete.
- Redirect before remove.
- Archive route code in a separate commit.
- Keep database tables.

### Explicitly Out Of Scope

- Dropping database tables.
- Deleting production data.
- Combining RyanOS and public Rykas marketing without a route ownership decision.

## Recommended First Coding Phase

Start with Phase 0.

Reason:

- The current app has a root-route conflict, local untracked marketing/dashboard work, modified layout metadata, and multiple identities.
- Hybrid V2 needs stable route ownership before navigation, data, and Today changes.
- Starting with Morning Launch before route stabilization risks building on top of drift.

Recommended first implementation prompt:

Resolve repository and route ownership only. Do not redesign. Confirm whether RyanOS or public marketing owns `/`, normalize README/layout/nav expectations, and leave all working app routes accessible.

## Unanswered Product Decisions

1. Should RyanOS own `/`, or should public Rykas marketing own `/`?
2. Should public Rykas marketing remain in this repository?
3. Should legacy market tools remain in this repository?
4. Should `/dashboard` become the tracked Action Sheet route?
5. Should Daily Brief remain email-capable long term?
6. Should Daily Brief content be archived, or only dispatch status?
7. Should Notebook photos be allowed in the first Notebook Bridge release?
8. Should ReadingProgress history exist, or is active ReadingPath enough?
9. Should the weekly guide be a printable page, a Daily Brief-style generated document, or both?
10. Should Google Calendar writeback remain parked for Hybrid V2?

## Code Risks Requiring Human Confirmation

1. Root route conflict: changing `/` affects login, marketing, Vercel, and user bookmarks.
2. Public marketing work is local/untracked; deciding to keep it may require staging a large unrelated product.
3. Daily Brief relies on Google Calendar, Sheets, Gmail, news, and scheduled jobs. Moving/hiding it could affect morning email use.
4. Legacy market tools use shared User/UserSettings models and deployment crons.
5. Prisma has two schema files; every model change must be duplicated.
6. Time-block board is the highest-value component and should be changed cautiously.
7. Mobile screenshot artifacts show nav/layout issues that could be worsened by adding more top-of-page content.
8. Adding notebook/spiritual features risks scope creep into journaling unless field limits are enforced.

## Proposed Small Codex Implementation Prompts

Prompt 1:

Read Hybrid V2 docs and current repo. Resolve only Phase 0 route/repo stabilization. Do not add features. Make `/` ownership explicit and keep RyanOS routes accessible.

Prompt 2:

Update authenticated navigation to Today, Work, Review, Library while preserving direct access to existing routes. Remove duplicate mobile horizontal nav. No schema changes.

Prompt 3:

Add Morning Launch UI to Today above the existing board with no schema changes first. Use local component state only. Preserve existing board behavior.

Prompt 4:

Add additive DailyPlan fields for Morning Launch, relationship intention, way of being, and shutdown history. Wire autosave. Preserve existing needle move and time-block behavior.

Prompt 5:

Create Library shell and Notebook index CRUD with Notebook and NotebookEntryIndex models. No OCR, no photos, no automatic task creation.

Prompt 6:

Wrap current Weekly Review Project Control in a two-phase Weekly Reset shell. Preserve existing project intelligence. Add only additive WeeklyReset fields if needed.

Prompt 7:

Add Reading Paths and RyanOS Method guide in Library. Show active reading reference in Morning Launch. No passages, streaks, or scores.

Prompt 8:

Evaluate Daily Brief, Action Sheet, legacy market tools, and public marketing routes for archival after five real mornings of Hybrid V2 use. Hide before deleting.

## Preservation Checklist

Before and after each phase, confirm:

- Login works.
- `/time-blocks` renders.
- Google Calendar events still appear read-only.
- Tasks can be scheduled on the board.
- Scheduled tasks can be cleared.
- Task queue excludes Parking Lot where intended.
- Task detail modal still opens.
- `/tasks` can create, edit, filter, bulk triage, mark done, and recur tasks.
- Recurring task next-copy behavior still works.
- `/projects` can create/edit projects and domains.
- `/weekly-review` still shows Project Control intelligence.
- Top 3 project controls still work.
- Stale/blocked/waiting task logic still works.
- `/daily-brief` still renders if retained.
- Daily Brief email send still works if retained/configured.
- Print behavior still excludes News Watch.
- `/print/action-sheet` still renders if retained.
- Legacy market routes still work if retained.
- Mobile bottom nav works.
- No duplicate mobile nav.
- No destructive Prisma migration.
- Both Prisma schemas are in sync after any schema work.

## Recommendation On Public Rykas Marketing And Legacy Market Tools

### Public Rykas Marketing

Recommendation:

- Move public Rykas marketing to a separate repository/deployment unless there is a strong reason to keep it together.

Reason:

- RyanOS is a personal operating system behind auth.
- Public Rykas marketing has a different audience, metadata, route ownership, visual/SEO needs, and conversion flow.
- Current local marketing changes already create identity and root-route conflict.

If kept in this repository:

- Isolate route group and shell.
- Ensure app metadata is route-specific.
- Do not let marketing own authenticated app layout.
- Make `/` ownership explicit.

### Legacy Market Tools

Recommendation:

- Keep temporarily, hidden from primary RyanOS nav.
- Later move to separate app or archive.

Reason:

- They are working and may have value.
- They are unrelated to Hybrid V2.
- Immediate deletion creates unnecessary data and regression risk.

Suggested future:

- Export/backup market data.
- Move watchlist/signals/chart/settings to separate route group or repo.
- Remove market cron from RyanOS deployment only after no longer used.

## Final Implementation Guidance

Hybrid V2 should be built like a careful renovation, not a rebuild.

The correct order is:

1. Stabilize route ownership.
2. Simplify navigation.
3. Add paper-to-digital Morning Launch above the current board.
4. Persist only the smallest daily fields.
5. Add notebook index.
6. Evolve weekly review.
7. Add reading paths.
8. Hide or archive duplicate surfaces only after real use proves they are no longer needed.

The current time-blocking board is the heart. Protect it.

