# Step 0 Audit - Daily Action OS to RyanOS

Date: 2026-07-02

## 1. Framework, Router, State

- Framework: Next.js 15 App Router with React 19 and TypeScript.
- Router: `app/` directory routes with server components by default and client components where marked with `"use client"`.
- Server mutations: Next server actions in `app/actions.ts`, `app/execution-actions.ts`, `app/time-blocks/actions.ts`, and `app/daily-brief/actions.ts`.
- Auth/session: NextAuth beta credentials provider in `auth.ts`; `requireUser()` in `lib/session.ts` gates app screens.
- State management: no Zustand/Redux. State is mostly server-rendered Prisma data plus local React state. The current RyanOS layer on the time-block page also uses `localStorage` for date-scoped UI-only fields.
- Styling: Tailwind CSS plus local UI primitives under `components/ui/`.

## 2. Persistence and Current Data Shape

- Primary persistence: Prisma.
- Local development datasource: SQLite via `prisma/schema.prisma`.
- Production datasource: Postgres/Neon via `prisma/schema.postgres.prisma`.
- Prisma client wrapper: `lib/prisma.ts`.
- Core execution tables:
  - `ExecutionDomain`: user-owned areas like Work, Rykas, Health, Admin.
  - `ExecutionProject`: project metadata, status, active status, weekly focus, priority, next action.
  - `ExecutionTask`: current task/block entity. Important fields: `title`, `type`, `estimatedDuration`, `status`, `priority`, `whenBucket`, `dueDate`, `followUpDate`, `waitingOn`, `note`, `source`, `isBlocked`, `pinToTodayUntilDone`, recurrence fields, `scheduledStart`, `scheduledEnd`, `completedAt`.
- Time blocks are currently stored as `ExecutionTask.scheduledStart` and `ExecutionTask.scheduledEnd`.
- Current RyanOS UI-only daily fields are stored in browser `localStorage` under `ryanos-execution:${dateKey}` in `components/execution/time-block-board.tsx`. These include needle move, decision rule, build recipient, 80% item checkbox, Rykas backlog count, and shutdown notes. This is not yet modeled in Prisma.
- Legacy/non-RyanOS persistence still present: watchlist/market tables, saved signal filters, `DailyBriefDispatch`, and marketing `ContactLead`.
- Missing requested model docs: `docs/MODEL.md` and `docs/DESIGN.md` do not exist yet.

## 3. Time-Blocking Page

Route:
- `app/time-blocks/page.tsx`

Main component:
- `components/execution/time-block-board.tsx`

Server data:
- `server/execution-service.ts`
- Main loader: `getTimeBlockPlannerData(userId, referenceDate)`
- Loads Google Calendar context from `server/google-calendar-service.ts`.
- Loads active non-done/non-dropped `ExecutionTask` rows from Prisma.
- Splits tasks into scheduled vs unscheduled based on selected day using `scheduledStart`.

Mutations:
- `app/time-blocks/actions.ts`
- `scheduleTaskTimeBlockAction(taskId, startIso)`: updates `scheduledStart`, `scheduledEnd`, and `whenBucket`.
- `clearTaskTimeBlockAction(taskId)`: clears scheduled time.
- `scheduleRyanOsBlockAction(templateId, startIso)`: current template-based addition for CCHCS, Pipeline, Rykas. It creates scheduled `ExecutionTask` rows with `source: RyanOS:<blockType>`.

Rendering/interactions:
- Desktop: drag tasks/templates onto 30-minute calendar slots.
- Desktop: drag scheduled tasks back to task queue to clear.
- Mobile: tap-to-place using suggested open slots.
- Google Calendar events are visible context and currently do not block Action OS tasks.
- Current board start/end hours are fixed at 6 AM-9 PM.
- Existing visual layout is concentrated in one large client component. Refactor should preserve it but likely split it into smaller components before adding many more RyanOS concepts.

## 4. Daily Brief / Print / Old Product Identity

Daily Brief files to remove, park, or repurpose:
- `app/daily-brief/page.tsx`
- `app/daily-brief/actions.ts`
- `app/api/cron/daily-brief/route.ts`
- `server/daily-brief-service.ts`
- `server/daily-brief-autosend.ts`
- `server/daily-brief-prompt.ts`
- `server/google-sheets-service.ts`
- `server/news-service.ts`
- Gmail send usage in `server/google-client.ts`
- Google auth bootstrap scopes in `scripts/google-auth-bootstrap.mjs`
- `DailyBriefDispatch` Prisma model

Printable Action Sheet files to remove, park, or repurpose:
- `app/print/action-sheet/page.tsx`
- `components/execution/print-action-sheet-button.tsx`
- `components/execution/print-browser-button.tsx`
- `components/execution/print-sheet-section.tsx`
- `components/execution/print-sheet-task-row.tsx`
- print CSS in `app/globals.css`
- Action Sheet language in `components/execution/action-sheet-section.tsx`, `components/execution/quick-task-form.tsx`, `components/execution/task-line-item.tsx`, and related routes.

Old identity references still present:
- "Daily Action OS" in app shell/header copy.
- "Daily Brief" nav and screen.
- "Action Sheet" nav, route, print controls, and settings copy.
- "Command Center" copy.

## 5. Current Routes and Dead Code Candidates

Current app routes detected:
- `/`
- `/about`
- `/amazon-launch`
- `/assessment`
- `/channel-control`
- `/chart/[symbol]`
- `/contact`
- `/daily-brief`
- `/dashboard`
- `/login`
- `/market-settings`
- `/print/action-sheet`
- `/projects`
- `/results`
- `/services`
- `/settings`
- `/signals`
- `/strategy`
- `/tasks`
- `/time-blocks`
- `/watchlist`
- `/weekly-review`

RyanOS target routes per brief:
- `/time-blocks` or `/today` as Today
- `/pipeline`
- `/rykas`
- `/library`
- `/settings` behind gear icon

Routes to remove or park for RyanOS scope:
- Marketing/site routes: `/about`, `/amazon-launch`, `/assessment`, `/channel-control`, `/contact`, `/results`, `/services`, `/strategy`
- Market/watchlist routes: `/chart/[symbol]`, `/dashboard`, `/market-settings`, `/signals`, `/watchlist`
- Old execution routes: `/daily-brief`, `/print/action-sheet`, likely `/weekly-review`, `/projects`, `/tasks` unless repurposed internally.

## 6. Workspace Risks Before Refactor

- Git worktree is dirty with many unrelated files and generated artifacts.
- `app/page.tsx` currently has a large uncommitted diff replacing the Action Sheet route with a redirect. This should be resolved deliberately before route cleanup.
- `prisma/schema.prisma` and `prisma/schema.postgres.prisma` are dirty before this audit; inspect before adding migrations.
- `docs/MODEL.md`, `docs/DESIGN.md`, and `docs/PARKED.md` are missing. The requested entity implementation should not begin until Section 13 is pasted into `docs/MODEL.md`.

## 7. Recommended Refactor Entry Point

- Preserve `components/execution/time-block-board.tsx` behavior first.
- Extract RyanOS-specific UI from `time-block-board.tsx` into smaller components before expanding model work:
  - `MorningCard`
  - `RyanOsBlockPalette`
  - `ShutdownPanel`
  - later `QueueSlideOver`
- Adapt `ExecutionTask` only for Increment 1 if possible. Add new Prisma models only after `docs/MODEL.md` is present.
- Keep Google Calendar read-only context for now; the current brief explicitly says not to add external calendar sync.
