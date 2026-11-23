# Plan screen (built 2026-11-22)

Ryan's design: projects with their task lists (his own tasks and items from the connected apps) next to a calendar, and he time-blocks by dragging. Plan replaces Today in the main menu; the old Today list stays under More.

## What it does

- **Left:** every open task grouped by area, then project. Feed items carry a small source label (eBay, Supplier OS, Field Book, AP Trader, Store route). Urgent items (critical, or due/expiring within two days) come first. Tasks waiting on someone are in "Waiting on others".
- **Right:** Day, 3-day or Week calendar with Google meetings (grey) and RyanOS blocks (colored by area). Outside-workday hours are shaded; a red line marks now.
- **Drag:** a task onto the calendar schedules it at the slot under the pointer. Drag a block to move it, pull its bottom edge to change its length, drag it onto the list (or press ×) to unschedule. Overlaps are allowed and reported in the message line; nothing else is moved.
- **Phone (narrower than 768px, changed 2026-11-22):** no tabs. The day's calendar is pinned under the header (about a third of the screen) with the projects and tasks scrolling underneath. Tap a task's name, then tap a time: free quarter-hours that fit it are green (others can still be tapped; overlaps are reported). Tap a block to move it, change its length, mark it done or take it off. Schedule (or Move) on any task also opens the sheet with free times today and tomorrow and a pick-a-time box. The 3-day and Week buttons are hidden on phones.
- **Tablet and up (768px+):** lists left, calendar right. Clicking a block opens the same sheet; tap-a-task, tap-a-time also works.
- **Fill my day:** places today's most important open work in free time (the existing day planner), then Ryan adjusts by dragging.
- **Quick add** (top of Plan, on Now, and an "Add task" line under every project): one line, Enter. Shorthand: `#project` or `#area`, `fri` / `tomorrow` / `11/30` (due date), `at 3pm` (puts it on the calendar; then the day is not a due date), `30m` / `1h`, `@name` (waiting on), `!` / `!!` (priority). Unknown words stay in the title; an unknown #tag is reported. Patient information is refused (NO PHI). Tasks added under a project go straight into it; no Inbox sorting. Inbox stays for loose ideas and photos.

## Finding things and filing new tasks (added 2026-11-22)

- **"→ Goes to" line** under the main add box shows, as you type, where the task will land and what was understood (calendar time, due date, length, waiting on, priority). With no project chosen it says "Admin · no project".
- **Type `#`** and a short list of matching projects (then areas) appears; tap one, or press Enter for the first. The chosen project shows as a chip with × to clear.
- **Folder button** beside the box opens the phone's own picker: every project grouped by area, or an area with no project.
- **Search and filters** above the lists: search (task, project, area, app; every word must match), area buttons, and Due soon / From apps / Mine / Not scheduled. "Clear (N of M)" resets. Per-project add lines are hidden while filtering.
- **Collapsed areas stay collapsed** on that device (browser storage; if it is unavailable everything simply opens).

## Files

`app/plan/` (page, server actions), `components/plan/plan-board.tsx`, `server/v2/board.ts` (read model), `server/v2/plan-board.ts` (schedule/move/unschedule, quick add, waiting-on), `lib/v2/quick-add.ts` (parser), `lib/v2/plan-filters.ts` (search, filters, #-suggestions), `server/v2/calendar-sync.ts` (Google two-way sync, see RYANOS_V2_INTEGRATIONS.md). Tests: `tests/quick-add.test.ts`, `tests/plan-filters.test.ts`, `tests/plan-board.test.ts`, `tests/calendar-sync.test.ts`.

## Limits

- Dragging uses the browser's drag-and-drop, which phones don't support; phones use the Schedule sheet.
- Block positions use local midnight plus minutes, so on the two daylight-saving changeover days a block can draw an hour off (its saved time is correct).
- Google sync is off until the calendar edit permission is granted and `FEATURE_GOOGLE_CALENDAR_WRITE=true` is set.
