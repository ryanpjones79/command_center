# Action Sheet Redesign

## Information Architecture

The app is now organized around execution instead of briefing:

1. `/`
   Daily Command Center and printable Action Sheet
2. `/print/action-sheet`
   Dedicated print artifact with compact one-page and extended two-page modes
3. `/weekly-review`
   Weekly Review and project control
4. `/tasks`
   Full task maintenance surface
5. `/projects`
   Project and domain maintenance surface
6. `/settings`
   Architecture notes, migration mapping, and legacy route access

The emailed Daily Brief remains external and unchanged.

## Recommended Component Structure

- `components/execution/print-action-sheet-button.tsx`
  Print trigger for the one-page Action Sheet
- `components/execution/quick-task-form.tsx`
  Fast capture into the Today bucket
- `components/execution/action-sheet-section.tsx`
  Compact section wrapper for Today, This Week, Waiting, Quick Wins, and Parking Lot
- `components/execution/task-line-item.tsx`
  Minimal task renderer optimized for screen and print
- `components/execution/print-sheet-section.tsx`
  Dedicated print section with deterministic caps and overflow counts
- `components/execution/print-sheet-task-row.tsx`
  Print-specific task row for compact or extended layouts
- `components/execution/create-task-form.tsx`
  Full task writeback form
- `components/execution/create-project-form.tsx`
  Weekly review project writeback form
- `components/execution/create-domain-form.tsx`
  Domain maintenance for custom areas

## Field Mapping

Legacy model to new task-first model:

- `Area.name` -> `ExecutionDomain.name`
- `Area.description` -> `ExecutionDomain.description`
- `Project.name` -> `ExecutionProject.name`
- `Project.priority` -> `ExecutionProject.priority`
- `Project.status`
  Split into `ExecutionProject.status` and `ExecutionProject.activeStatus`
- `Project.nextAction` -> `ExecutionProject.nextAction`
- `Project.lastTouched` -> `ExecutionProject.updatedAt` and `lastReviewedAt`
- `Task.title` -> `ExecutionTask.title`
- `Task.priority` -> `ExecutionTask.priority`
- `Task.dueDate` -> `ExecutionTask.dueDate`
- `Task.details` -> `ExecutionTask.note`
- `Task should stay on Today across days` -> `ExecutionTask.pinToTodayUntilDone`
- `Task.isComplete`
  Maps to `ExecutionTask.status = DONE`
- `Task.tags`
  Used to infer `type`, `whenBucket`, and `waitingOn` when possible

## Migration Plan

1. Create the new execution tables.
2. Seed default domains so imported data has safe landing zones.
3. Import legacy project/task data into `ExecutionProject` and `ExecutionTask`.
4. Default anything ambiguous to:
   - task `type = ACTION`
   - task `whenBucket = LATER`
   - project `activeStatus = ACTIVE_LATER`
5. Only set `pinToTodayUntilDone` on work that should intentionally remain in Today until finished.
6. Run Weekly Review once to assign:
   - Top 3
   - Active Now
   - Parked
7. Use the Action Sheet as the only daily operating page after migration.

## Design Principles

- Task-first, not project-first
- Print-friendly by default
- Compact print mode is capped to one page
- Extended print mode is fixed to two pages without fragmented sections
- Minimal metadata on daily views
- Weekly review owns project cleanup
- Writeback stays in the app
- Daily Brief stays in email
