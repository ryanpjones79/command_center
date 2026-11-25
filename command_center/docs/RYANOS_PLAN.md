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

## Daily habits (added 2026-11-22)

A strip at the top of Plan shows today's routines (walk, workout, ...) as one-tap check-offs with a streak (🔥 = scheduled days done in a row; days a habit isn't scheduled are skipped, and an unfinished today doesn't break it). Tap again to undo. "place" picks the habit so you tap a time on the calendar. "+ Habit" adds one (name, length, days, area: Health, Family/kids or Personal); edit or pause them on Standard week (`/time-blocks/routines`). Routine copies no longer appear in the project lists. Code: `server/v2/habits.ts`, `tests/habits.test.ts`.

## Scheduling workspace (changed 2026-11-25)

Plan is now the main place to schedule. The layout changed: the **calendar is the main panel** (left on desktop, pinned on top on a phone) and a **rail** beside it holds what to book next. The older "lists left, calendar right" and three-column board notes above describe the previous layout.

- **Bookable today:** free time left after Google meetings, booked blocks and protected routine blocks, from now (or the workday start) to the day's end, listed as windows of 15 minutes or more (`lib/v2/day-load.ts`).
- **Preview my day** (also the header's "Plan my day" and the Coach's morning button): proposes today's blocks with the existing day planner and draws them as dashed blocks on the calendar. **Nothing is booked** until "Book N blocks"; untick any line to leave it out. Booking re-checks each slot under the booking lock and reports any it skipped (`previewDayAction`, `bookPlanAction`).
- **Missed today:** today's blocks that ended without being marked done. "Next free slot" moves the same task to the first free time (`nextSlotAction`, the existing `scheduleAction`); "Pick a time", "Back to list" and "Did it" also work. The Now screen's ended-block card and the Coach's "ended" message have the same Next free slot button.
- **Ready for you:** up to six of Ryan's own open to-dos that are not booked, pinned-for-today first, then deadlines, then priority. Each shows its length, project, attached draft and source links, and a one-click "Book 7:15 PM" button for the first free time today (or tomorrow), plus "Other time".
- **Agent preparing:** actions an agent is still working on, listed apart and **not bookable** (and never proposed by the day planner). "Take it over" makes one Ryan's immediately.
- **Folded by default:** All to-dos (search and area lists), Routines and App check-ins.
- **No duplicates:** a booked block is the task row itself (`scheduledStart`/`scheduledEnd`), so Plan, Now and the Google Calendar sync all show the one task; moving it keeps its project, links and source.

### Agent preparing vs ready for Ryan (no new columns)

- **Preparing:** `status = WAITING` and `waitingOn` starts with `Agent`, for example `Agent: drafting the profile` (the text after the colon is shown).
- **Handing over:** the agent attaches its work as task references (`ExecutionTaskReference`, `provider = "draft"` or `"source"`, `https://` URLs or RyanOS paths only) and sets `status = NOT_STARTED`, `waitingOn = null`. Code: `lib/v2/readiness.ts`; tests: `tests/plan-readiness.test.ts`.
- First end-to-end test (local database): Freelance launch → "Draft Upwork/Contra profile (send nothing until approved)". Preparing → draft and Upwork link attached → ready → booked in one click → missed → moved to the next free slot, still one task with both links.

## Files

`app/plan/` (page, server actions), `components/plan/plan-board.tsx`, `server/v2/board.ts` (read model), `server/v2/plan-board.ts` (schedule/move/unschedule, quick add, waiting-on), `lib/v2/quick-add.ts` (parser), `lib/v2/plan-filters.ts` (search, filters, #-suggestions), `server/v2/calendar-sync.ts` (Google two-way sync, see RYANOS_V2_INTEGRATIONS.md). Tests: `tests/quick-add.test.ts`, `tests/plan-filters.test.ts`, `tests/plan-board.test.ts`, `tests/calendar-sync.test.ts`.

## Limits

- Dragging uses the browser's drag-and-drop, which phones don't support; phones use the Schedule sheet.
- Block positions use local midnight plus minutes, so on the two daylight-saving changeover days a block can draw an hour off (its saved time is correct).
- Google sync is off until the calendar edit permission is granted and `FEATURE_GOOGLE_CALENDAR_WRITE=true` is set.
