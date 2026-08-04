# RyanOS Hybrid V2 Route Map

Status: planning specification only
Created: 2026-08-03

This document maps the current route surface to the proposed RyanOS Hybrid V2 information architecture. It does not authorize route changes by itself.

## Proposed Authenticated Navigation

Primary authenticated nav:

- Today
- Work
- Review
- Library

Persistent action:

- Global Capture

Settings:

- Gear icon, not a primary tab.

## Current-To-Proposed Route Map

| Current route | Current purpose | Current status | Proposed destination | Decision | Desktop nav | Mobile nav | Migration risk | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Root redirect to `/time-blocks` for authenticated users and `/login` for unauthenticated users | Working tracked route, but conflicts with local marketing direction | RyanOS root alias to Today, or public marketing root only if marketing remains in same app | Preserve conceptually as RyanOS entry; resolve conflict before implementation | Yes if RyanOS owns root | Opens Today | High | `app/page.tsx`, auth, marketing route work |
| `/login` | Credentials login | Working | Login | Preserve | No | No | Low | NextAuth, `auth.ts`, `components/auth/login-form.tsx` |
| `/time-blocks` | Main RyanOS Today time-block board | Working and central | Today | Preserve and make primary | Yes as Today | Yes as Today | Medium | `TimeBlockBoard`, Google Calendar, tasks, DailyPlan, RykasDay |
| `/today` | Not currently present | Planned alias | Today | Add later, not now | Yes | Yes | Low-medium | Redirect/alias strategy |
| `/dashboard` | Action Sheet execution page, local untracked | Partial/hidden/local | Work or secondary print/action sheet output | Merge useful parts; hide primary route until resolved | No | No | Medium-high | Action Sheet sections, quick capture, Git tracking conflict |
| `/daily-brief` | Daily Brief preview/email/print | Working legacy/optional | Review or Library archive, secondary action from Today | Move out of primary nav; preserve | No primary | No primary | Medium | Google Calendar, Sheets, Gmail, news, DailyBriefDispatch |
| `/print/action-sheet` | Dedicated print Action Sheet | Working legacy print route | Review or print-only utility | Preserve hidden/secondary | No | No | Low-medium | print CSS, action sheet data |
| `/tasks` | Full task maintenance | Working but dense | Work / Tasks subview | Preserve, de-emphasize | Under Work | Secondary under Work | Medium | ExecutionTask, server actions, filters |
| `/projects` | Project/domain maintenance | Working | Work / Projects subview or Review / Project Control edit affordance | Preserve | Under Work | Secondary under Work | Medium | ExecutionProject, ExecutionDomain |
| `/weekly-review` | Project Control weekly review | Working | Review / Project Control + Weekly Reset | Preserve and evolve | Under Review | Under Review | Medium-high | Weekly review loader/actions, WeeklyReset |
| `/settings` | Architecture notes, seed domains, legacy links | Working but not user settings | Gear settings | Move behind gear and simplify later | Gear only | Gear/menu only | Medium | App shell, default domains, market settings links |
| `/watchlist` | Legacy market watchlist | Working legacy sidecar | Archive or separate app | Archive from RyanOS nav | No | No | Medium | Market models, refresh services |
| `/signals` | Legacy market signals scanner | Working legacy sidecar | Archive or separate app | Archive from RyanOS nav | No | No | Medium | Market services, saved filters |
| `/chart/[symbol]` | Legacy ticker chart | Working legacy sidecar | Archive or separate app | Archive | No | No | Medium | PriceBar, chart component |
| `/market-settings` | Legacy market settings | Working legacy sidecar | Archive or separate app | Archive | No | No | Medium | UserSettings, market services |
| `/api/auth/[...nextauth]` | Auth API | Working | Auth API | Preserve | Not visible | Not visible | Low | NextAuth |
| `/api/cron/daily-brief` | Daily Brief autosend | Working/optional | Optional Daily Brief background job | Preserve hidden until Daily Brief decision | No | No | Medium | Gmail, DailyBriefDispatch, env |
| `/api/cron/nightly` | Market nightly refresh | Legacy | Archive/separate app if market tools split | Preserve until separated | No | No | Medium | market data service |
| `/api/health` | Health endpoint | Working | Health endpoint | Preserve | No | No | Low | Deployment |
| `/api/refresh/[symbol]` | Market refresh | Legacy | Archive/separate app | Preserve until market split | No | No | Medium | market data |
| `/api/refresh-all` | Market refresh all | Legacy | Archive/separate app | Preserve until market split | No | No | Medium | market data |
| `/api/signals/export` | Market CSV export | Legacy | Archive/separate app | Preserve until market split | No | No | Medium | signals service |
| `/about` | Public Rykas marketing, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No in RyanOS | No | High | marketing shell/content |
| `/amazon-launch` | Public Rykas marketing, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | marketing shell/content |
| `/assessment` | Public Rykas marketing, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | ContactLead |
| `/channel-control` | Public Rykas marketing, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | marketing shell/content |
| `/contact` | Public Rykas marketing/contact lead form, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | ContactLead |
| `/services` | Public Rykas marketing, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | marketing shell/content |
| `/results` | Public redirect to `/channel-control`, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | redirect |
| `/strategy` | Public redirect to `/amazon-launch`, local untracked | Untracked/local | Separate marketing app/repo preferred | Move out or isolate | No | No | High | redirect |
| `/robots.ts` | Marketing SEO, local untracked | Untracked/local | Separate marketing app/repo or RyanOS-specific robots | Decide after root conflict | No | No | Medium | metadata/site URL |
| `/sitemap.ts` | Marketing SEO, local untracked | Untracked/local | Separate marketing app/repo or RyanOS-specific sitemap | Decide after root conflict | No | No | Medium | metadata/site URL |

## Navigation Visibility Recommendation

Desktop:

- Top nav: Today, Work, Review, Library.
- Right side: gear settings, sign out.
- Persistent global Capture button.
- Daily Brief, Action Sheet, legacy market, and marketing routes should not appear in primary nav.

Mobile:

- Bottom nav only: Today, Work, Review, Library.
- Floating or docked Capture action.
- No horizontal desktop nav on mobile.
- Gear/settings accessible from a compact top-right menu or Library footer.

## Proposed Route Shape

Recommended eventual route shape:

```
/                         -> Today if authenticated, login if not
/today                    -> Today alias, may redirect to /time-blocks during transition
/time-blocks              -> Existing Today route preserved
/work                     -> Work landing
/work/tasks               -> Task maintenance, current /tasks
/work/projects            -> Project maintenance, current /projects
/work/areas               -> Domain maintenance
/review                   -> Review landing
/review/shutdowns         -> Daily shutdown history
/review/weekly-reset      -> Weekly Reset wizard, may alias /weekly-review
/weekly-review            -> Existing Project Control / Weekly Reset transition route
/library                  -> Library landing
/library/notebooks        -> Notebook index
/library/reading          -> Reading paths
/library/principles       -> Principles and saved insights
/library/parking          -> Parked ideas
/library/method           -> RyanOS Method guide
/settings                 -> Gear settings
```

Transition route strategy:

- Keep `/time-blocks`, `/tasks`, `/projects`, `/weekly-review`, `/daily-brief`, and `/print/action-sheet` working during migration.
- Add new wrappers/aliases only after navigation is stabilized.
- Do not delete legacy routes until their replacement has passed real morning use.

## Text Wireframes

### Desktop Today

```
[Header]
RyanOS
Today | Work | Review | Library                         [+ Capture] [Gear] [Sign out]

[Hero]
Today Command Board                                      [Previous] [Today] [Next]
Reflect on paper. Decide in RyanOS. Schedule realistically.

[Morning Launch]
Reading Path: Bhagavad Gita - Chapter 2
Your notebook is the active workspace.
Read slowly. Write honestly. Return when ready to decide.
[Begin Paper Session] [Continue to Today] [Skip today]

[How RyanOS Works] (collapsible)
Paper is where you think. RyanOS is where you commit.
Reflect on paper -> choose one completed result -> schedule realistically -> close the app.

[Daily Decision]
Left:
  Today's Needle Move
  [completed-result textarea]
  Who needs my presence today?
  [relationship intention input]
  How do I want to be?
  [way-of-being chips/input]
  Decision rule selector
  Recipient if build/artifact
Right:
  Guardrails
  80% item checkbox
  Rykas backlog
  Warnings only when relevant

[Main Planning Area]
Left:
  Google Calendar + Task Blocks visual grid
  Read-only calendar events on left
  Scheduled tasks/blocks on right
Right:
  Required Daily Blocks
  CCHCS
  Pipeline - 30 minutes
  Rykas - 45 minutes
  Task Queue
  All-day / FYI
  Agenda

[Shutdown]
What shipped?
Still open?
Likely Needle Move tomorrow?
Notebook entries to index?
[Close day]
```

### Mobile Today

```
[Compact header]
RyanOS / Today / date                                  [+]

[Morning Launch card]
Read: current physical reading reference
Your notebook is the active workspace.
[Begin Paper Session]
[Continue to Today]

[Collapsed guide]
How RyanOS Works

[Needle Move]
[completed-result input]

[Presence]
Who needs my presence today?

[Way of Being]
How do I want to be?

[Required Blocks]
CCHCS [Place]
Pipeline 30m [Place]
Rykas 45m [Place] [Dismiss]

[Timeline]
Calendar and placed work in chronological list
Tap item -> detail bottom sheet

[Task Queue]
Cards with "Place" and suggested slots

[Shutdown]
Three compact fields

[Bottom nav]
Today | Work | Review | Library
```

### Work

```
[Header]
Work
Maintain commitments without turning maintenance into the day.

[Tabs or segmented control]
Tasks | Projects | Areas

[Tasks]
Search/filter
Task list
Bulk triage
Add task
Task edit drawer/details

[Projects]
Top 3 / Active Now / Parked filters
Project cards
Linked tasks
Next action maintenance

[Areas]
Execution domains list
Add/edit area
Default domains
```

### Weekly Reset

```
[Review Header]
Weekly Reset
Reflect on paper first. Reconcile digitally second.

[Phase 1: Paper Reflection]
Prompts list
[Begin paper reflection]
[Continue to digital reconciliation]

[Phase 2: Digital Reconciliation]
Step 1 Notebook transfers
Step 2 Blocked and waiting work
Step 3 Projects missing next action
Step 4 Top 3 projects
Step 5 Stale work decisions
Step 6 Next week's theme
Step 7 Complete reset
Step 8 Generate / print weekly guide

[Project Control Foundation]
Existing summary cards and project cards remain visible inside the flow.
```

### Notebook Library

```
[Library Header]
Notebook Index
Find the page. Do not transcribe the life.

[Active Notebook]
Notebook 01
Started date
Description

[Fast Index Form]
Notebook
Page
Title
Type
Area
Project optional
Summary optional
[Save index]

[Search]
Query | Notebook | Type | Area | Project | Date

[Results]
Notebook 01 - Page 18
Gita: work without controlling the outcome
Spiritual Reflection
```

### Reading Path

```
[Library Header]
Reading Paths
Open the physical book. RyanOS only tracks the reference.

[Active Path]
Bhagavad Gita
Current reference: Chapter 2
Theme: action without controlling outcome
Last read: date
Saved insight: optional one line

[Paths]
Bhagavad Gita
Dhammapada
Meditations
Tao Te Ching
Custom

[Edit Path]
Title
Current reference
Theme
One-line insight
Active toggle
```

### Full RyanOS Method Guide

```
[Library Header]
RyanOS Method

[Daily Process]
Reflect on paper
Choose one completed result
Schedule realistically
Do the work
Return to adjust or close

[Weekly Process]
Reflect on paper
Process notebook
Reconcile projects
Choose the next week
Print guide

[What Belongs On Paper]
Reflection, sketches, free thinking, meeting notes, spiritual practice

[What Belongs In RyanOS]
Commitments, tasks, projects, schedule blocks, searchable indexes

[What Not To Capture]
Every thought, guilt, performative spirituality, someday noise

[Reset The System]
1. Open the notebook.
2. Write everything creating mental noise.
3. Choose one meaningful completed result.
4. Enter only true commitments into RyanOS.
5. Schedule the next visible action.
6. Release the rest for now.
```

## Route Consolidation Conflicts To Resolve Before Coding

1. Does RyanOS own `/`, or does public Rykas marketing own `/`?
2. Is `/dashboard` intended to become the tracked Action Sheet route, or should it remain out of scope?
3. Should `/daily-brief` remain a route, or move to `/library/daily-brief` later?
4. Should `/weekly-review` remain the canonical Review route, or become `/review/weekly-reset` with redirect?
5. Should legacy market tools remain in this repo or move to a separate app?

