# RyanOS Refactor State

## 2026-07-02

- Completed Step 0 inspection only.
- Wrote `docs/AUDIT.md`.
- No RyanOS model implementation started in this session.
- Blocked before model work: `docs/MODEL.md` and `docs/DESIGN.md` are missing.
- Worktree has pre-existing unrelated dirty files; future commits should stage narrowly.

## 2026-07-02 Refactor Session

- Increment 0 shipped:
  - Committed home-route redirect to `/time-blocks` separately.
  - Committed dirty Prisma schema files as a standalone pre-refactor snapshot.
  - Added root `.gitignore` rules for generated report/render artifacts.
- Increment 0.5 shipped:
  - Extracted `components/execution/time-block-board.tsx` into `MorningCard`, `RyanOsBlockPalette`, `ShutdownPanel`, and `TimeBlockGrid`.
  - Kept scheduling, drag/drop, local state, and localStorage behavior in the parent board for zero behavior change.
- Verification:
  - `npm run lint` passed.
  - `npm run build` passed.
  - Browser smoke check was attempted, but the local dev server listened on port 3000 without responding before timeout.
- Stopped before Increment 1:
  - `docs/MODEL.md` and `docs/DESIGN.md` are still missing, so model/migration work is blocked.
- Next:
  - Add `docs/MODEL.md` and `docs/DESIGN.md`.
  - Then implement the RyanOS persisted model, one-time localStorage import, block identity colors, and one-needle-per-user-day invariant.

## 2026-07-02 MVP Scope + S2

- Added `docs/MVP-SCOPE.md`, `docs/MODEL.md`, and `docs/DESIGN.md` to this repo.
- MVP-SCOPE supersedes DESIGN where they conflict.
- S2 shipped:
  - Added RyanOS MVP Prisma model to both schema files:
    - `ExecutionTask` RyanOS extensions.
    - `DailyPlan`, `QueueItem`, `PipelineAction`, `RykasDay`, `ParkedIdea`, `WeeklyReset`.
  - Excluded frozen/cut models from MVP: `Pattern`, `Touch`, `GuardrailOverride`.
  - Added one SQLite migration: `20260702000000_add_ryanos_mvp_model`.
  - Time-block loader now creates/returns `DailyPlan` and `RykasDay`.
  - Time-block board imports legacy `ryanos-execution:${dateKey}` once, writes it into Prisma, removes the key, and no longer writes the old localStorage path.
  - DailyPlan fields and Rykas backlog now autosave through server actions.
- Verification:
  - `node scripts/prisma-command.mjs format` passed for SQLite and Postgres schemas.
  - `node scripts/prisma-command.mjs generate` passed for SQLite and Postgres schemas.
  - `npm run lint` passed.
  - `npm run build` passed.
  - `npm run test` passed: 2 files, 6 tests.
  - `prisma migrate dev` could not run because the environment is non-interactive.
  - `prisma migrate deploy` hit pre-existing local SQLite migration drift on `20260629144500_add_execution_task_recurrence` duplicate column.
  - Local SQLite schema was synced safely with `node scripts/prisma-command.mjs db push --skip-generate`.
- Next:
  - S3 Blocks: 5 type colors on the grid, needle star, server-enforced one needle per user/day, and shipped tap action.

## 2026-08-03 Phase 5 - Seasons

- Shipped Seasons as a lightweight organizing layer:
  - Added `Season` to both Prisma schemas with title, description, dates, status, theme color, icon, and current-season flag.
  - Added optional `seasonId` on `ExecutionProject`; existing projects default to no season.
  - Added additive migration `20260803002000_add_seasons`.
  - Added service/actions that enforce only one current season per user through transactions.
  - Added `/library/seasons` as the Season Archive with current season, editable seasons, completed seasons by year, and project context.
  - Added optional Season assignment to project create/edit surfaces.
  - Added Current Season compass card near the top of Today.
  - Added current-season prompt to Weekly Reset and the printable weekly guide.
- Verification:
  - `node scripts/prisma-command.mjs format` passed for SQLite schema.
  - `npx prisma format --schema prisma/schema.postgres.prisma` passed.
  - `node scripts/prisma-command.mjs generate` passed.
  - `node scripts/prisma-command.mjs db push --skip-generate` synced local SQLite.
  - `npm test` passed: 9 files, 43 tests.
  - `npm run build` passed.
  - `npm run lint` passed.
- Next:
  - If desired, add a small default seed/current-season starter only after Ryan chooses the first real season title.

## 2026-08-03 Phase 7 - RyanOS Method & Principles

- Shipped RyanOS Method as a permanent Library reference:
  - Rebuilt `/library/method` into a calm philosophy guide with Why RyanOS Exists, Paper vs RyanOS, Daily Rhythm, Weekly Rhythm, Core Principles, What Not To Capture, Reset The System, and Season Philosophy.
  - Added a condensed print-only Method artifact intended for one-to-two page notebook insertion.
  - Added print CSS for `.method-print-root`, `.method-print-grid`, and `.method-print-card`.
  - Updated the compact Today "How RyanOS Works" card with a direct `Learn More` link to `/library/method`.
  - Added a browser-only one-time onboarding gate that opens the Method page on first authenticated app use and never forces it again in that browser.
- Constraints kept:
  - No Prisma, database, migration, analytics, AI, score, or achievement changes.
  - Onboarding state uses localStorage only.
- Verification:
  - `npm test` passed: 10 files, 49 tests.
  - `npm run build` passed before the final copy compatibility patch.
  - `npm run lint` passed.
