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

## A day he'd follow (changed 2026-11-25, second pass)

- **Preview my day** is the one planning button (the header copy was removed; the Coach's morning button opens the same preview). It proposes up to **3 commitments**, ticked: protected-area to-dos, what Ryan pinned or picked, real deadlines (due or expiring within two days; overdue work is placed too), work moved to today, then the next action of a project he chose for the week (one per project, the one furthest behind its weekly minutes first). If there are fewer than three, a routine behind its weekly pace fills the rest. Up to 4 more go under **If there's time**, unticked. Every line shows why it was picked; anything that didn't fit is listed with the reason. The interruption buffer stays free. Code: `server/v2/plan.ts`.
- **Wrap-up's plan-tomorrow and the Coach's fallback** book commitments only.
- **Availability (one set of rules, `lib/v2/availability.ts`)**, used by Bookable today, the preview, one-click Book, Next free slot, the Coach and Now:
  - Busy: timed Google Calendar events. All-day events never block.
  - Optional: events marked "Show as free" in Google, or titled like "A vs B" / "A @ B" (`RYANOS_OPTIONAL_EVENT_WORDS`, `|`-separated, overrides the default). They're drawn dashed and listed under Bookable, but don't block unless `RYANOS_OPTIONAL_EVENTS_BLOCK=true`.
  - Protected: CCHCS work hours on weekdays (Settings workday start/end) for everything except Work-area tasks and business-hours tasks (PHONE, ERRAND, DESK); Family, Kids and Health blocks.
  - Unknown: if Google can't be read, Bookable says the times are unconfirmed, and the preview and booking messages say so.
  - "What this counts" under Bookable lists the sources (with status and time read) and protections.
- **Booking re-checks the slot.** One-click "Book 7:15 PM" and "Book N blocks" call `bookSlot`, which re-checks the exact slot under the booking lock with the same rules and refuses it if a meeting, protected time or another block now overlaps. Drag-and-drop and "Pick a time" stay manual: they allow overlaps and report them.
- **Ready for you** cards show context instead of a badge: Due today / Due tomorrow / Overdue, Pinned today, Weekly priority, Draft attached.
- **Short titles:** long imported titles show as their first line or sentence (`lib/v2/short-title.ts`); the full text is in the tooltip and task details. New imports store the full text in the note (see RYANOS_V2_INTEGRATIONS.md).
- **Now** shows the current block, else the meeting you're in, else one thing that fits (only Work tasks during work hours), else the next block on the calendar, with its length and a Details link. Missed blocks never take over: they're listed under **Needs rescheduling** with Next free slot, Move… and Did it. During work hours with nothing planned it says "Work hours until 5:30 PM".
- **Task details** (`/tasks?taskId=…`) now show the task even when it's done, with its note, draft and source.
- **Fix:** on blocks shorter than 30 minutes the resize handle no longer covers the ✓ and × buttons.

## Today redesign: project shelf and phone time grid (changed 2026-11-25, third pass)

Built from Ryan's handoff (Project shelf for desktop, Approved-Mobile-Layout for phones). The sections above describe earlier layouts; where they differ, this one is current.

- **Desktop / tablet (768px+):** date and open time, then **Pinned projects** (up to 6), the **next-action tray**, then the calendar with a small rail (Your commitments, Needs a decision, Missed, Agent preparing, What counts as open time, and the folded All to-dos / Routines / App check-ins). The full sidebar shows on Plan again (the icon strip is gone).
  - A project click filters the tray in place (click again or "All priorities" to clear). The tray shows the top 3 with "View all N actions" for the rest. Each card: title, estimate, one short reason (`reasonFor` in `lib/v2/today.ts`), and Draft/Source/Details links when they exist.
  - **Drag** a card to an open slot, or press **Plan**, then click (or Tab + Enter) a highlighted time or use "Next opening". Both call the same server scheduler (`bookSlot`), which rechecks the slot under a lock: overlaps with meetings, protected blocks or work hours are refused with a message and nothing is written. Moving a block keeps the same task row. Resizing still uses the block editor (it records the new length).
  - **Next free block** is the secondary mode (toggle beside Pinned projects, remembered per browser): the next opening, what fits it, and "N actions need a longer block".
  - **Calendar window:** today opens at the current half hour, after a protected work window that covers it, through the end of the planning day (later blocks extend it). Earlier and protected time is folded above the grid; opening it shows the whole planning day. 30-minute labels, 15-minute lines. Meetings, work hours and protected (family, kids, health) blocks are muted; RyanOS blocks carry their area colour; optional events sit at the side and don't block.
  - "Preview my evening/day" shows the draft plan in the calendar card (dashed blocks) and books only after "Book selected".
- **Phone (under 768px):** heading with a **Calendar** shortcut, the **Next free** callout (what limits it), a swipeable row of pinned projects, the selected project's (up to) two actions that fit the next opening with a large **Plan** button and "See N other actions", then the time grid as the last section. **Plan → choose a time → Add to calendar**; choosing a time alone saves nothing and Cancel writes nothing. No drag on phones.
- **Phone bottom bar:** Today (`/plan`) · Inbox · Projects · Review (`/review`). **Now** moved from the phone bar to the RyanOS logo and the top of Tools and more. Desktop navigation is unchanged (Now · Plan · Projects · Inbox).
- **Pinned projects** (no pin field exists, so derived; `shelfProjects` in `server/v2/board.ts`): active projects with a ready, unscheduled action of Ryan's own, plus weekly top-3 projects; ordered top 3, then projects given time this week, then the project holding the most urgent ready action, then the most ready. Up to 8 (6 on desktop). To pin by hand later, the smallest change is an additive nullable `pinnedAt` column on `ExecutionProject`.
- **Needs a decision** uses the same rule as the Inbox badge (needs-judgment tasks whose follow-up date has come, plus captured ideas).
- The coach card no longer shows on Plan (its "free until" line is now the Next free callout); `components/plan/coach-card.tsx` and `server/v2/coach.ts` are unchanged.
- Colours: `--t-*` tokens in `app/globals.css` (light and dark), exposed as `today-*` in Tailwind. Code: `components/plan/today.tsx`, `lib/v2/today.ts`, `components/plan/plan-board.tsx`, `components/layout/app-shell.tsx`. Tests: `tests/plan-today.test.ts` (fitting acceptance case, time-sheet starts, grid window, reasons, shelf order, single-write booking, protected/stale-slot refusal, links kept).

## Files

`app/plan/` (page, server actions), `components/plan/plan-board.tsx`, `server/v2/board.ts` (read model), `server/v2/plan-board.ts` (schedule/move/unschedule, quick add, waiting-on), `lib/v2/quick-add.ts` (parser), `lib/v2/plan-filters.ts` (search, filters, #-suggestions), `server/v2/calendar-sync.ts` (Google two-way sync, see RYANOS_V2_INTEGRATIONS.md). Tests: `tests/quick-add.test.ts`, `tests/plan-filters.test.ts`, `tests/plan-board.test.ts`, `tests/calendar-sync.test.ts`.

## Limits

- Dragging uses the browser's drag-and-drop, which phones don't support; phones use the Schedule sheet.
- Block positions use local midnight plus minutes, so on the two daylight-saving changeover days a block can draw an hour off (its saved time is correct).
- Google sync is off until the calendar edit permission is granted and `FEATURE_GOOGLE_CALENDAR_WRITE=true` is set.
