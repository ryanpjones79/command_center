# docs/DESIGN.md — RyanOS Design Spec (condensed, in-repo authority)

Purpose of the app: a compliance surface for RyanOS. (1) Make the 10-minute morning ritual mechanical, (2) fire guardrails at the moment of temptation, (3) make Friday's reset a guided 30-minute wizard. Work happens elsewhere; the app decides what and when.

Anti-identity: not a task manager, not a CRM, not an inventory system, not a knowledge base, not a dashboard.

## Navigation

Exactly 4 tabs: **Today** (`/time-blocks`, may alias `/today`) · **Pipeline** (`/pipeline`) · **Rykas** (`/rykas`) · **Library** (`/library`). Settings behind a gear icon. `/weekly-review` is repurposed as the Reset wizard route, launched from a Friday banner on Today (visible Fri ≥ 2pm local until reset completed). All other routes: removed from nav and redirected; code deletion is a separate parked increment.

## Today screen

**A. Morning Card** (expanded until complete, then collapses to one line):
- Decision stepper, vertical, stop at first true, data-fed (Phase 2; static prompts acceptable in Phase 1):
  1. CCHCS 48h — scheduled/owed tasks with blockType='cchcs' due <48h; owedToLeadership items >24h old pin to top.
  2. Conversation available — Touch rows overdue/next-touch today, flagged reply-waiting.
  3. Ship something — top 3 QueueItems, oldest first, days badge.
  4. Pipeline is the move — default.
- Needle Move: one-line input, placeholder "Write it as a completed result…". Stores ruleStep.
- Required chips: Pipeline 30m, Rykas 45m — must be placed on the grid before card collapses. Rykas chip dismissible one tap (sets DailyPlan.rykasDismissed).
- Last reset's three outcomes shown collapsed at top of card.

**B. Time grid** — existing `time-block-board.tsx` interaction preserved (drag on desktop, tap-to-place mobile, 6am–9pm, 30-min slots, Google Calendar read-only context retained). Additions only: block color by blockType, ★ needle flag (one per day), tap actions complete / move / "this shipped ✓" (sets shippedAt).

**C. Shutdown strip** (Phase 2) — after last block: shipped? (tap blocks) → new 80% item? (one-tap add) → tomorrow's likely move (prefills next DailyPlan). Skippable.

**D. Scattered button** — persistent, small. Full-screen card, three fixed lines:
1. Scattered means ship, not plan. 2. The rate order decides: CCHCS → conversation → ship → pipeline. 3. Nothing new opens today — park it.
One action: "Show me the closest-to-done thing" → top QueueItem + "start a 25-minute block now" (drops block at current time). No journaling.

## Block types (5, hard ceiling) + flag

cchcs = navy · pipeline = green · rykas = amber · admin = gray · personal = soft blue. ★ Needle is a flag, not a type. There is no "parking" block type — parking is the global ＋ capture action.

## Global ＋ capture

On every screen. Two fields (idea, lane), <10 seconds, saves ParkedIdea, returns to prior context. There is deliberately no "new project" affordance anywhere in the app.

## Guardrails (Phase 2; all overridable except #2; all overrides logged to GuardrailOverride and surfaced in Reset step 2)

1. Recipient gate: isBuild block without recipient → primary button becomes "Park it instead" (pre-filled); long-press override allowed.
2. Rykas sourcing lock: backlog ≥ 10 disables Source with copy "Backlog is N. List X to unlock." No override.
3. 80% interrupt: any new build/promotion while queued items exist → one inline prompt showing oldest item; proceed-anyway logged.
4. Queue soft cap 7: adding 8th → "ship or kill one first" (override logged).
5. Rykas cap: rykas blocks >45 min/day requires override tap (logged).
Tone: never guilt language, never ambient banners, fire only in the action's path.

## Pipeline screen

Top: `Conversations this week: n / 2` (Sat→Fri window). Middle: five one-tap loggers — Comment · Warm DM · Follow-up · Post · Conversation★ (Conversation requires "with whom?"). Weekly tally row as text counts. Bottom: touch list — name, next touch date, one-line note; sorted by date, overdue floats; hard cap 30 with graduation message. Absent by design: stages, deal values, orgs, email logging, charts.

## Rykas screen

Order = money-move hierarchy: (1) backlog integer with +/−; (2) To ship list — if nonempty, header says "Ship first."; (3) Offers/Relist done-today checkbox; (4) Listed today counter (+ decrements backlog); (5) Source — locked at backlog ≥ 10; (6) 45-min timer, at 0:00 one line: "Cap reached. Rykas is capped, not loved." No item catalog, no profit math.

## Library

Two tabs. **Patterns:** capture form (title, shape 2–6 lines, type enum, canBecome checkboxes) with permanent inline reminder: "Patterns only. No data, no names, no facilities, no internal documents. If in doubt, rebuild the shape from a synthetic example." Per-pattern Export = copy markdown to clipboard, increments usedCount. Filter by canBecome. No folders/tags/search (<40 items). **Parking:** list with ⚑ flag for missing trigger; "Expiring" section for 90-day untouched; promotion only via Reset wizard. Reset history (read-only) lives here.

## Weekly Reset wizard (route: /weekly-review)

Step 1 Open loops: all queued QueueItems + week's incomplete blocks + touches overdue >7d; each row must become Ship (schedule Monday block or mark shipped) / Kill / Park. Cannot advance with undecided rows.
Step 2 Metrics: conversations n/2, ships n/3, backlog n + trend arrow, plus overrides count and builds-without-recipient count. Optional one-line "why" per miss. No streaks, no grades.
Step 3 Three outcomes: lane-tagged, max one per lane, written as results. Displayed on next week's Morning Cards.
Step 4 Parking triage: expiring decided → unflagged decided → promote-one offered only if step 1 closed ≥1 loop. Promotion creates a QueueItem or scheduled block, never a "project."
Finish: outcomes + "Reset done. Close the laptop."

## Style & anti-bloat (binding)

Calm, fast, dense; respect existing Tailwind tokens. No gamification (single check animation on shipping a queue item is the entire celebration budget). No charts. No notifications. No in-app AI. No calendar write/sync (read-only context stays). No tags/folders/search until scanning fails. No recurring-block engine (the two chips are the recurrence system). No multi-user features. No item-level Rykas inventory. Settings = block colors, Rykas cap minutes, queue cap, week-start day — four settings, no more. No new screens without deleting one. Feature test: does it make correct behavior faster or scattered behavior slower? If neither, it's bloat.
