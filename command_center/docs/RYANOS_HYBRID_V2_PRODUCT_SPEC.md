# RyanOS Hybrid V2 Product Specification

Status: planning specification only
Created: 2026-08-03
Source context: `CURRENT_STATE_RYAN_OS.md`, current `command_center` code, existing screenshots in `docs/current-state-screenshots/`, and current RyanOS MVP docs.

## Current-State Validation

The current-state brief still accurately reflects the major app facts:

- The app is a Next.js App Router application with Prisma persistence, NextAuth credentials auth, server actions, and Tailwind styling.
- The current RyanOS center is `/time-blocks`, implemented by `components/execution/time-block-board.tsx` plus extracted `MorningCard`, `RyanOsBlockPalette`, `TimeBlockGrid`, and `ShutdownPanel` components.
- Google Calendar is read-only context. Internal task blocks are stored on `ExecutionTask.scheduledStart` and `ExecutionTask.scheduledEnd`.
- Tasks, projects, recurrence, scheduling, parking-lot bucket, project control, Daily Brief, Action Sheet, and legacy market tooling all still exist.
- Current screenshots show a strong desktop board, dense task maintenance, a useful Weekly Review/Project Control screen, and mobile navigation/layout issues.
- Existing RyanOS MVP entities exist in both Prisma schemas: `DailyPlan`, `QueueItem`, `PipelineAction`, `RykasDay`, `ParkedIdea`, and `WeeklyReset`.
- There is a live conceptual conflict around `/`: current tracked root redirects to `/time-blocks`, while local untracked marketing work and README imply `/` should become a public Rykas marketing route and internal Action Sheet should move to `/dashboard`.

This specification does not treat the proposed redesign as automatically correct. The working execution engine, task/project maintenance, recurrence, schedule board, Daily Brief print discipline, and Project Control intelligence are valuable and should be preserved or moved deliberately.

## 1. Product Vision

RyanOS Hybrid V2 is a paper-and-digital personal operating system.

The product is not trying to replace the notebook. It is trying to protect the notebook's role and make the app do only the parts that software does well.

Paper supports:

- Reflection.
- Spiritual practice.
- Free-form thinking.
- Meeting notes.
- Sketches and diagrams.
- Personal discernment.
- Slow reading.
- Private, unfinished thoughts.

Digital supports:

- Commitments.
- Projects.
- Tasks and actions.
- Time blocks.
- Calendar context.
- Searchable indexes.
- Follow-up memory.
- Reviews.
- Realistic scheduling.

The app should direct Ryan toward deliberate action rather than encourage ongoing app usage. A successful app session may end with Ryan closing the laptop or putting the phone down.

Current product principle:

RyanOS decides what matters. Time blocking decides when it happens.

Expanded Hybrid principle:

Reflect on paper. Decide in RyanOS. Schedule realistically. Live away from the screen. Return to review.

### Central Operating Loop

Daily:

1. Read physically.
2. Write physically.
3. Decide digitally.
4. Time-block digitally.
5. Work in real life.
6. Capture sparingly.
7. Close the day.

Weekly:

1. Reflect on paper.
2. Process notebook.
3. Reconcile projects digitally.
4. Choose the next week.
5. Produce or print the weekly guide.

### Product Boundary

RyanOS Hybrid V2 should not become:

- A digital journal.
- A spiritual scoring system.
- A phone-distraction engine.
- A generic task manager.
- A CRM.
- A project-management suite.
- A replacement for physical books, notebooks, and life.

## 2. Product Principles

### Preserve What Works

- Preserve the current visual identity: dark, calm, dense, emerald/amber accents, card-based command surfaces.
- Preserve the current Today time-blocking board.
- Preserve Google Calendar as read-only context for now.
- Preserve tasks, projects, recurrence, scheduling, and Project Control.
- Preserve the current execution engine instead of rebuilding it.
- Preserve Daily Brief and Action Sheet capabilities until their future role is deliberately resolved.
- Preserve existing data and avoid destructive migrations.

### Paper First Where Paper Is Better

- Do not replace the app with a paper-planner interface.
- Do not require users to type handwritten reflections into the app.
- Do not use OCR or photo transcription as a first-release requirement.
- Do not capture every thought.
- Do not turn every idea into a task.
- Do not make the app the place where Ryan spiritually performs.

### Digital Only Where Digital Helps

- RyanOS should hold commitments, not every thought.
- RyanOS should remember what would otherwise leak out of memory.
- RyanOS should schedule realistically, not aspirationally.
- RyanOS should make commitment decisions visible.
- RyanOS should make the next right action cheaper than scattered behavior.

### Tone

- Do not score spirituality.
- Do not use guilt-based overdue language.
- Do not shame missed tasks.
- Use decision language: do, reschedule, return to project, park, release.
- Use calm, direct, nonjudgmental copy.

### Mobile Discipline

- Mobile should be calmer and simpler than desktop.
- Mobile should support the morning ritual, quick review, and sparse capture.
- Mobile should not recreate the full desktop maintenance console.
- Mobile should help Ryan leave the screen.

### Incremental Delivery

- Add new functionality incrementally.
- Avoid destructive migrations.
- Keep old routes available until replacements are proven.
- Do not remove working capability as part of a speculative redesign.

## 3. Proposed Information Architecture

Proposed authenticated navigation:

- Today
- Work
- Review
- Library

Persistent capture action:

- A global Capture action should be available from all authenticated screens.
- It should be intentionally small, fast, and biased toward non-commitment capture.

### Label Evaluation

Recommended labels: Today, Work, Review, Library.

Rationale:

- Today is clearer than RyanOS for the main daily execution screen.
- Work is broader and calmer than Tasks; it can contain Tasks, Projects, and Areas without making maintenance primary.
- Review is clearer than Weekly Review because it can contain daily shutdown history, Project Control, Weekly Reset, and seasonal reflection.
- Library is appropriate for notebook indexes, reading paths, principles, saved insights, parked ideas, and reference material.

Alternative considered:

- Today, Commitments, Reset, Library.

Why not recommended:

- Commitments is accurate but heavier than Work.
- Reset is too narrow for daily shutdown history and monthly/seasonal review.

### Today

Today includes:

- Morning Launch.
- Today's Needle Move.
- Relationship intention.
- Way of being.
- How RyanOS Works compact reminder.
- Guardrails.
- Google Calendar context.
- Required blocks.
- Time-blocking board.
- Task queue.
- Shutdown.

Today owns the daily decision and scheduling flow. It should remain the app's center of gravity.

### Work

Work contains internal views for:

- Tasks.
- Projects.
- Areas or domains.

Existing task/project maintenance should be preserved here, but Work should be clearly secondary to Today. It is the garage, not the cockpit.

Recommended Work subviews:

- Tasks: current `/tasks`, cleaned up over time.
- Projects: current `/projects`, merged with project maintenance pieces from Weekly Review only if that improves clarity.
- Areas: current `ExecutionDomain` maintenance, currently buried inside Projects/Settings.

### Review

Review includes:

- Daily shutdown history.
- Weekly Reset.
- Project Control.
- Monthly or seasonal review.

The current `/weekly-review` Project Control screen should become a foundation inside Review, not be discarded.

### Library

Library includes:

- Notebook index.
- Reading paths.
- Principles.
- Saved insights.
- Parked ideas.
- Reference material.
- Optional Daily Brief archive.
- Full RyanOS Method guide.

Library is not a digital journal. It is an index and reference shelf.

## 4. Morning Launch

Morning Launch is a lightweight ritual layer before the current execution board.

It should not be another checklist. It should create a short transition from paper reflection into digital commitment.

### Steps

1. Read.
2. Write.
3. Decide.

### Read

Display:

- Current physical reading assignment or passage reference.
- Optional theme.
- Optional one-line saved insight from last session.

Do not display:

- Long copyrighted passages.
- In-app reading content that replaces the physical book.
- Streaks or pressure language.

Example:

Reading Path: Bhagavad Gita
Current reference: Chapter 2
Theme: action without controlling outcome

Copy:

Open the physical book. Read slowly. Mark only what matters.

### Write

Prompt Ryan to write in the physical notebook.

Suggested prompts:

- What deserves my attention today?
- What can I release?
- How do I want to show up?

Copy:

Your notebook is the active workspace.

Read slowly.
Write honestly.
Return when you are ready to decide.

### Decide

Continue into Today's Needle Move.

The app should ask for only the minimum digital commitment:

- One completed result.
- Relationship intention.
- Way of being.

### Begin Paper Session State

Recommended behavior:

- Morning Launch appears inline at the top of Today as a focused, expanded card.
- It should not be a modal because the user may want to glance at the day's calendar or return later without feeling blocked.
- It should not be a separate route because the Today screen is the ritual context.

Actions:

- Begin Paper Session.
- Continue to Today.
- Skip for Today.

Begin Paper Session behavior:

- Expands the paper-session copy.
- Optionally records `paperSessionStartedAt`.
- Does not start a timer unless Ryan explicitly asks later.
- Keeps the screen calm and minimal.

Continue to Today behavior:

- Marks Morning Launch complete for the selected date.
- Collapses the card into a one-line summary.
- Moves focus to Today's Needle Move.

Skip behavior:

- Marks Morning Launch skipped for the selected date.
- Requires no guilt copy.
- Suggested copy: "Skipped for today. Continue with the smallest true commitment."

Already completed behavior:

- Show a compact collapsed line:
  "Paper session complete. Continue with today's commitment."
- Provide a small "Review launch" affordance.

Persistence:

- Completion should be persisted per user/date.
- Minimal fields should live on `DailyPlan` or a companion model. Prefer `DailyPlan` additions first.

Avoid checklist behavior:

- Do not show checkboxes for reading/writing.
- Do not count streaks.
- Do not require text entry for paper reflections.
- Do not require a quote, prayer, insight, or journal entry.

## 5. Today Screen

Today should preserve the existing time-block board and Needle Move while refining the daily hierarchy.

### Daily Hierarchy

1. Today's Needle Move.
   - One completed result that would make the day meaningful.
   - Written in completed-result language.

2. Who needs my presence today?
   - A person or relationship intention.
   - Not automatically a task.

3. How do I want to be?
   - Examples: present, patient, courageous, detached, disciplined, kind.
   - Not automatically a task.

4. Schedule realistically.
   - Use Google Calendar context.
   - Place required blocks.
   - Place only the tasks that fit.

5. Leave the app.
   - Work in real life.
   - Return only to capture, adjust, or close the day.

### Desktop Behavior

Desktop should preserve:

- Date navigation.
- Current command-board hero.
- Morning/Needle panel visual style.
- 6 AM to 9 PM time grid.
- 30-minute slots.
- Drag/drop task and template scheduling.
- Calendar events as read-only amber context.
- Scheduled task blocks on the grid.
- Required blocks side palette.
- Task detail modal.
- Shutdown panel.

Desktop should add:

- Morning Launch card above Needle Move.
- Relationship intention field.
- Way of being field.
- Compact How RyanOS Works reminder.
- Clearer separation between paper ritual, commitment decision, and scheduling board.
- Block identity refinements without replacing the grid.

### Mobile Behavior

Mobile should not force desktop grid behavior.

Mobile should prioritize:

- Morning Launch.
- Needle Move.
- Relationship intention.
- Way of being.
- One-tap suggested scheduling.
- Agenda/timeline view.
- Task detail bottom sheet.
- Quick shutdown.

Mobile should remove:

- Duplicate horizontal desktop nav.
- Cramped side-by-side controls.
- Large unexplained blank regions.
- Dense maintenance forms from the primary Today view.

### Empty States

No calendar events:

- "No calendar commitments found. Build the day from true commitments."

No task queue:

- "No queued tasks for today. Place required blocks or choose one from Work."

No clean work block:

- "No clean work block. Use short execution windows."

Morning Launch not started:

- "Start on paper. Return when ready to decide."

No Needle Move:

- "Choose one completed result before filling the day."

### Autosave Behavior

Existing autosave:

- `DailyPlan.needleMove`
- `DailyPlan.ruleStep`
- `DailyPlan.shutdownNote`
- `RykasDay.backlogAfter`

Recommended autosave additions:

- `DailyPlan.relationshipIntention`
- `DailyPlan.wayOfBeing`
- `DailyPlan.morningLaunchStatus`
- `DailyPlan.paperSessionStartedAt`
- `DailyPlan.paperSessionCompletedAt`
- `DailyPlan.howItWorksCollapsed`

Autosave should remain debounced and calm. Avoid toast spam.

### Date Navigation

Preserve current Previous / Today / Next behavior.

For past days:

- Today board becomes review-oriented.
- Allow viewing schedule and shutdown.
- Avoid prompting for new morning launch unless intentionally editing.

For future days:

- Allow light planning.
- Do not show morning launch as active ritual.

### Existing Guardrails

Preserve:

- Named recipient warning for build/artifact work.
- Rykas backlog warning at 10+.
- 80% item warning.

Refine:

- Parking is a capture/action destination, not a block type.
- Warnings should appear only in the path of the action.
- Warnings should suggest decisions, not shame.

### Required Blocks

Preserve:

- CCHCS.
- Pipeline 30 minutes.
- Rykas max 45 minutes.

Refine:

- Required blocks should remain draggable/addable.
- Rykas should be dismissible where appropriate.
- Required block status should be visible but not visually dominant after placement.

### Calendar Context

Preserve Google Calendar as read-only context for now.

Do not add calendar writeback in Hybrid V2 first release. This conflicts with earlier user interest in writing back to Google Calendar, but the Hybrid V2 philosophy favors minimal screen dependency and preservation of the current engine. Calendar writeback can be parked as a later decision.

### Task Selection

Preserve:

- Task queue.
- Suggested open slots.
- Click/tap task detail.
- Open in Tasks link.
- Clear scheduled block back to queue.

Refine:

- Filter out Parking Lot from Today and Action Sheet queues.
- Make task detail consistent across Today, Work, and Review.
- Use decision language for tasks requiring attention.

### Shutdown Behavior

Current shutdown has:

- Shipped.
- Still open.
- Likely Needle Move tomorrow.

Recommended Hybrid V2 shutdown:

- What shipped?
- What remains open?
- What likely matters tomorrow?
- Any notebook entry to index?
- Close the app.

Persist shutdown history so Review can show it.

## 6. Paper and Notebook Bridge

The Notebook Bridge is a lightweight index, not a transcription system.

It should answer:

- Where did I write that down?
- What page has the decision?
- Which notebook entry relates to this project?
- Which reflections or insights may matter later?

It should not require:

- Full transcription.
- OCR.
- Photo capture.
- Digital journaling.

### Proposed Entities

Notebook:

- `id`
- `userId`
- `title`
- `number`
- `startedAt`
- `completedAt`
- `description`
- `createdAt`
- `updatedAt`

NotebookEntryIndex:

- `id`
- `notebookId`
- `date`
- `pageNumber`
- `title`
- `summary`
- `domainId`
- `projectId`
- `entryType`
- `photoUrl`
- `createdAt`
- `updatedAt`

Entry types:

- Insight.
- Decision.
- Project Note.
- Spiritual Reflection.
- Idea.
- Meeting.
- Reference.

Examples:

- Notebook 01, Page 18: "Gita: work without controlling the outcome." Type: Spiritual Reflection.
- Notebook 01, Page 27: "CTCC supervisor bucket redesign." Linked project: CTCC Evolution.

### Fast Capture Flow

Target: index an entry in under 30 seconds.

Fields:

- Notebook.
- Page number.
- Title.
- Entry type.
- Optional domain.
- Optional project.
- Optional one-line summary.

Default behavior:

- Date defaults to today.
- Notebook defaults to active notebook.
- Summary is optional.
- No task is created by default.

### Search Behavior

Search should cover:

- Title.
- Summary.
- Entry type.
- Notebook number/title.
- Domain.
- Project.
- Date.
- Page number.

First release can use basic database filtering and text search through Prisma. No full-text search engine is required.

### Linking

Link to projects:

- Optional `projectId` on `NotebookEntryIndex`.
- Project pages can show linked notebook entries.
- Weekly Reset can surface entries from the week that have a project link or action-like entry type.

Link to areas:

- Prefer `domainId` over freeform area text to reuse `ExecutionDomain`.

### Photo Later

A photo may be attached later, but should be out of scope for first release unless storage is already available.

Future photo support:

- `photoUrl`
- storage provider decision
- privacy warning
- no OCR by default

### Explicitly Out of Scope First Release

- OCR.
- Full transcription.
- AI summary.
- Notebook page image storage.
- Tagging system.
- Rich text editor.
- Spiritual scoring.
- Daily journal replacement.

## 7. Capture Classification

RyanOS Hybrid must prevent every idea from becoming a commitment.

### Conceptual States

Thought:

- A mental item that may not need capture.
- Best home: paper or nowhere.

Possibility:

- Something that might become real later.
- Best home: `ParkedIdea` or notebook index.

Action:

- A concrete next step.
- Best home: `ExecutionTask`.

Commitment:

- Something Ryan has chosen to protect.
- Best home: scheduled `ExecutionTask`, pinned task, project next action, or DailyPlan needle move.

Reference:

- Useful information with no action.
- Best home: Library, NotebookEntryIndex, project note, or external document.

Parked:

- Intentionally not now.
- Best home: `ParkedIdea` or `ExecutionTask.whenBucket = PARKING_LOT`, depending on whether it is an idea or task.

### Relationship to Existing Entities

`ExecutionTask`:

- Use for actions and commitments.
- Should not hold every idea.
- `PARKING_LOT` bucket should remain for tasks that were real enough to become tasks but are not active.

`ParkedIdea`:

- Use for possibilities and ideas not yet committed.
- Should not appear in Today task queue or Action Sheet.

`QueueItem`:

- Use for 80% items that need ship/kill/park decisions.
- More committed than ParkedIdea.
- Less generic than ExecutionTask.

`Project`:

- Use for larger initiatives worth tracking and reviewing.
- Do not create projects from capture by default.

`NotebookEntryIndex`:

- Use for locating paper-based thoughts, decisions, meeting notes, insights, and reflections.
- It may link to project/domain but should not automatically create tasks.

### Recommendation On Overlap

Keep distinct for now:

- `ParkedIdea`
- task `PARKING_LOT`
- `NotebookEntryIndex`
- `QueueItem`

Rename in UI:

- `PARKING_LOT` task bucket -> "Parked Tasks" or "Task Parking".
- `ParkedIdea` -> "Parked Ideas".
- `QueueItem` -> "80% Queue" or "Ship/Kill/Park Queue".

Do not merge destructively. Add explanatory UI and eventually migrate only after real usage shows the boundaries are wrong.

## 8. Weekly Reset

Weekly Reset should preserve current Project Control intelligence and add a paper-first process.

### Phase 1: Reflect On Paper

The first phase happens away from the app.

Prompts:

- What gave me energy?
- What created noise?
- What did I avoid?
- What moved forward?
- Where was I attached to an outcome?
- Who needs care or attention?
- Which notebook entries require action?

UI:

- Show a focused paper-session card.
- Provide "Begin paper reflection" and "Continue to digital reconciliation".
- Do not require typing reflections into RyanOS.

### Phase 2: Reconcile Digitally

Guide:

1. Process notebook transfers.
2. Review blocked and waiting work.
3. Resolve projects missing a next action.
4. Select Top 3 projects.
5. Decide what to do with stale work.
6. Choose the next week's theme or operating emphasis.
7. Complete the reset.
8. Generate or print the weekly guide.

### Foundation

Use current `/weekly-review` Project Control as the foundation:

- Keep summary cards.
- Keep missing next action detection.
- Keep blocked/waiting visibility.
- Keep stale project/task intelligence.
- Keep Top 3 and Active Now controls.
- Keep task health rows.

Add wizard framing around it instead of replacing it wholesale.

### WeeklyReset Model Usage

Existing `WeeklyReset` should be extended minimally:

- Keep existing metrics fields.
- Use `outcomes` as JSON for next-week outcomes or theme.
- Add fields only if needed for Hybrid behavior:
  - `paperReflectionStartedAt`
  - `paperReflectionCompletedAt`
  - `notebookProcessedAt`
  - `weekTheme`
  - `guideGeneratedAt`

Avoid storing full paper reflection text.

## 9. Reading Paths and Spiritual Practice

Reading Paths should be restrained.

They track where Ryan is reading, not how spiritually successful he is.

### Reading Path Fields

ReadingPath:

- id.
- userId.
- title.
- sourceType.
- currentReference.
- optional theme.
- lastReadAt.
- optional one-line saved insight.
- isActive.
- sortOrder.
- createdAt.
- updatedAt.

Examples:

- Bhagavad Gita.
- Dhammapada.
- Meditations.
- Tao Te Ching.
- Custom reading path.

### Morning Launch Appearance

Morning Launch shows:

- Active reading path title.
- Current chapter, section, or passage reference.
- Optional theme.
- Optional one-line saved insight.

Copy:

Open the physical book. Read slowly. Return when ready to decide.

### Library Appearance

Library shows:

- Reading paths list.
- Active path.
- Current reference.
- Last read date.
- One-line insight.
- Edit controls.

### Do Not

- Do not turn readings into streaks.
- Do not score spiritual performance.
- Do not require long digital journaling.
- Do not display large copyrighted passages.
- Do not prescribe one religion or tradition.

## 10. How RyanOS Works Reminder

RyanOS should teach its own intended process without becoming noisy.

### Compact Today Reminder

Title:

How RyanOS Works

Content:

1. Reflect on paper.
2. Choose one completed result.
3. Schedule the work realistically.
4. Put the phone down and do the work.
5. Return to capture, adjust, or close the day.

Supporting statement:

Paper is where you think. RyanOS is where you commit.

Behavior:

- Expanded during onboarding.
- Collapsible.
- Collapsed state remembered.
- Accessible through an info/help action.
- Takes minimal space after understood.

Persistence:

- User-level setting is preferred over per-day state.
- If no settings model change yet, localStorage is acceptable temporarily for this UI preference only.

### Full Library Guide

Page title:

RyanOS Method

Include:

- Daily process.
- Weekly process.
- What belongs on paper.
- What belongs in RyanOS.
- What should not be captured.
- Examples.
- How to process a notebook.
- How to recover after falling out of the system.

Reset the system sequence:

1. Open the notebook.
2. Write everything creating mental noise.
3. Choose one meaningful completed result.
4. Enter only true commitments into RyanOS.
5. Schedule the next visible action.
6. Release the rest for now.

## 11. Mobile Experience

Mobile must support a morning ritual under ten minutes.

### Required Improvements

- Remove duplicate horizontal desktop navigation on mobile.
- Keep one bottom navigation.
- Avoid making the desktop grid the primary mobile interaction.
- Use mobile agenda/timeline.
- Make Morning Launch, Needle Move, and quick scheduling easy with one hand.
- Reduce horizontally cramped select and input controls.
- Avoid large unexplained blank regions.
- Keep Work maintenance reachable but not primary.

### Mobile Today Wireframe

```
[Top: RyanOS / date / compact menu]

[Morning Launch]
Read: Bhagavad Gita - Ch. 2
Your notebook is the active workspace.
[Begin Paper Session]
[Continue to Today]

[How RyanOS Works collapsed]

[Today's Needle Move]
Completed result input

[Presence]
Who needs my presence today?

[Way of Being]
How do I want to be?

[Required Blocks]
CCHCS [Place]
Pipeline 30m [Place]
Rykas 45m [Place or Dismiss]

[Today Timeline]
8:00 Calendar event
9:30 Pipeline block
11:00 Task block

[Task Queue]
Tap a task -> detail bottom sheet -> place in suggested slot

[Shutdown]
What shipped?
Still open?
Likely tomorrow?

[Bottom nav: Today | Work | Review | Library] [+ Capture]
```

### Mobile Rules

- The time grid may exist behind a "Visual grid" affordance, but timeline is primary.
- Select fields should become stacked controls or segmented buttons.
- Maintenance forms should not appear in Today.
- Capture should be two fields max by default.

## 12. Desktop Experience

Desktop should preserve the full visual board and drag/drop scheduling.

### Desktop Today Wireframe

```
[App shell: Today | Work | Review | Library] [gear] [+ Capture]

[Command Board hero]
Date controls: Previous | Today | Next

[Morning Launch card]
Read physical book reference
Write in notebook prompt
Begin Paper Session / Continue to Today / Skip

[How RyanOS Works compact reminder]

[Daily Decision panel]
Left:
  Today's Needle Move
  Relationship intention
  Way of being
  Decision rule
  Recipient if build/artifact
Right:
  Guardrails
  Rykas backlog
  80% item warning

[Scheduling area]
Left/main:
  Google Calendar + Task Blocks grid
Right:
  Required Daily Blocks
  Task Queue
  All-day / FYI
  Agenda

[Shutdown]
Shipped
Still open
Likely Needle Move tomorrow
Notebook entries to index
```

### Desktop Rules

- Keep drag/drop.
- Keep amber Google Calendar context.
- Keep task detail modal.
- Do not replace the board with a paper-planner layout.
- Add paper bridge above the board, not instead of the board.

## 13. Route and Feature Consolidation

### Root Route Conflict

Current conflict:

- Tracked root redirects authenticated users to `/time-blocks`.
- Local untracked marketing work and README imply `/` should become the public Rykas marketing site.

Recommendation:

- If RyanOS is the product being hosted at `daily-action-os.vercel.app`, keep `/` as authenticated RyanOS redirect or alias to Today.
- If Rykas marketing is a separate business site, move it to a separate repo or deployment.
- Do not mix public marketing and RyanOS personal operating system in the same production app unless there is a strong hosting reason.

Conceptual resolution:

- RyanOS app: `/` -> `/today` or `/time-blocks`.
- Public Rykas marketing: separate deployment, or `/public` only if absolutely necessary.

Do not change routes in this task.

### Route Decisions

`/time-blocks`

- Preserve.
- Rename in nav to Today.
- Eventually add alias `/today`.

`/tasks`

- Preserve.
- Move under Work conceptually.
- Keep full maintenance capability.

`/projects`

- Preserve.
- Move under Work or Review depending on final IA.
- Do not discard project maintenance.

`/weekly-review`

- Preserve and evolve.
- Move under Review.
- Use as Weekly Reset plus Project Control foundation.

`/daily-brief`

- Preserve for now.
- Move out of primary nav.
- Possible future location: Library archive or Review printable brief.

`/dashboard`

- Preserve if accepted into tracked code.
- Merge useful Action Sheet quick capture/sections into Today or Work.
- Avoid duplicate daily planning workflows.

`/settings`

- Move behind gear.
- Replace architecture notes with actual settings over time.

Legacy market routes:

- Archive or move to separate app/repo.
- Remove from RyanOS primary nav.
- Keep code/data until intentionally separated.

Public Rykas marketing routes:

- Prefer separate repository/deployment.
- If kept in this repo, isolate clearly and do not let layout metadata/nav corrupt RyanOS.

## 14. Daily Brief and Action Sheet

Daily Brief and Action Sheet have value, but they currently duplicate parts of Today.

### Capabilities To Keep

- Daily Brief generation.
- Daily Brief email send if configured.
- Compact Daily Brief print output.
- News Watch online only.
- Action Sheet printable discipline.
- Quick capture.
- Follow-up/waiting visibility.
- Quick wins and Top 3 project context.

### Future Role

Daily Brief:

- Optional printable briefing.
- Not primary daily workflow.
- Possible location: Review or Library -> Daily Brief Archive.
- May remain accessible from Today via secondary action: "Open printable brief."

Action Sheet:

- Merge execution-relevant pieces into Today and Work.
- Keep print artifact if it remains useful.
- Retire as standalone primary route only after Today fully replaces it.

### Avoid Duplicates

Do not maintain three daily planning surfaces:

- Today board.
- Daily Brief.
- Action Sheet.

Recommended destination:

- Today is primary.
- Daily Brief is optional output.
- Action Sheet is either print-only or merged into Today.

## 15. Language and Tone

RyanOS Hybrid tone should be:

- Calm.
- Direct.
- Nonjudgmental.
- Execution-oriented.
- Spiritually open without being religiously prescriptive.
- Free of guilt-driven productivity language.

### Replace This

"12 overdue tasks"

With:

"Three commitments need a decision."

### Decision Language

Possible decisions:

- Do.
- Reschedule.
- Return to project.
- Park.
- Release.

### More Examples

Instead of:

- "You failed to complete your reset."
- "You are behind."
- "Overdue."
- "Streak broken."

Use:

- "This needs a decision."
- "Choose the next visible action."
- "Return this to the project."
- "Park it until there is a trigger."
- "Release it for now."

## 16. Success Criteria

Hybrid V2 succeeds when:

- Morning planning can be completed in under ten minutes.
- Ryan leaves the app with one clear next action.
- Mobile no longer shows duplicate navigation.
- Paper reflections can be indexed in under thirty seconds.
- Weekly Reset produces clear Top 3 projects and next actions.
- The existing scheduling engine remains intact.
- The existing task/project data remains intact.
- Existing recurrence and scheduling behavior is preserved.
- No working feature is unintentionally lost.
- Google Calendar remains trustworthy read-only context.
- RyanOS reduces unnecessary phone interaction rather than increasing it.
- Daily Brief and Action Sheet are secondary outputs, not competing daily cockpits.
- The app helps Ryan close the screen and return to physical life.

