# docs/MVP-SCOPE.md — RyanOS MVP (supersedes DESIGN.md wherever they conflict)

## One product principle

**Make the correct next action one tap cheaper than the scattered one.**
Every feature is judged against this. If it doesn't make right behavior faster or scattered behavior slower, it isn't built.

## Five screens, maximum

1. **Today** — Morning Card (4 static rule lines + needle-move input + ★) over the existing time grid with 5 block types. The 80% Queue is a slide-over panel here. Global ＋ lives here (and everywhere).
2. **Pipeline** — `Conversations: n/2` + five log buttons (Comment / DM / Follow-up / Post / Conversation★ with "with whom?").
3. **Rykas** — backlog integer, to-ship list, offers checkbox, listed counter, Source locked at backlog ≥ 10, 45-min timer.
4. **Parking** — list of parked ideas (⚑ if no trigger, "Expiring" at 90 days). Fed by the global ＋.
5. **Reset** (`/weekly-review`) — 4 steps: loops → metrics → three outcomes → parking triage w/ promote-one. Soft prompts, no hard walls.

Settings behind a gear (4 settings max). No Library, no Patterns screen (PATTERNS.md file owns that), no Touch list (the outreach sheet owns that).

## Ten required behaviors

1. Morning Card blocks the grid view until a Needle Move is written and a rule step (1–4) is tapped.
2. Exactly one ★ needle block per day, enforced server-side.
3. Pipeline 30m and Rykas 45m chips must be placed (Rykas dismissible, one tap) before the card collapses.
4. Every block has one of 5 types; type = color; no sixth type, ever.
5. Tapping a block can mark it "shipped ✓" (distinct from done).
6. The 80% Queue sorts oldest-first with day badges (amber 7, red 14); items resolve only to shipped / killed / parked.
7. The global ＋ captures to Parking in two fields, under 10 seconds, from any screen. No "new project" affordance exists anywhere.
8. Source is disabled at backlog ≥ 10. No override. The only hard rule in the app.
9. Conversations and Ships compute over Sat→Fri; the Reset shows exactly three numbers (conversations, ships, backlog) as text.
10. Parked ideas can be promoted only inside the Reset, max one, only if ≥1 loop was closed; two renewals = auto-delete.

## MVP data model (6 models + ExecutionTask extensions — cut from MODEL.md: Pattern, Touch, GuardrailOverride)

`ExecutionTask` + blockType, isNeedle, isBuild, recipient, shippedAt, owedToLeadership.
`DailyPlan`, `QueueItem`, `PipelineAction`, `RykasDay`, `ParkedIdea`, `WeeklyReset` — as specified in MODEL.md.

## Codex-ready build sequence (one increment per session; STATE.md updated every session; no increment starts before the prior one is verified in real use)

```
S0  Hygiene: resolve app/page.tsx diff as its own commit; snapshot-commit both
    dirty prisma schemas; .gitignore generated artifacts; narrow staging only.
S1  Extraction: split time-block-board.tsx into MorningCard, BlockPalette,
    grid core (+ empty ShutdownPanel stub NOT rendered). Zero behavior change;
    verify page is pixel-identical before commit.
S2  Model: ExecutionTask extensions + the 6 MVP models, identical in both
    schema files, one migration. One-time localStorage import
    (ryanos-execution:*) into DailyPlan/RykasDay, then delete that code path.
S3  Blocks: 5 type colors on the grid + needle ★ (server-enforced one/day)
    + "shipped ✓" tap action.
S4  Morning Card: 4 static rule lines, needle-move input storing ruleStep,
    required chips w/ placement check, card collapse. App opens into the card.
S5  Queue: QueueItem CRUD + slide-over on Today, oldest-first, day badges,
    ship/kill/park actions (ship = the one allowed check animation).
S6  Capture + Parking: global ＋ (idea + lane) on all screens; Parking screen
    with ⚑ and Expiring sections. Nav trimmed to the 4 tabs; legacy routes
    de-navved and redirected (deletion parked).
S7  Pipeline: counter (Sat→Fri) + five loggers ("with whom?" on Conversation).
S8  Rykas: backlog +/- , to-ship list w/ "Ship first." header, offers
    checkbox, listed counter decrementing backlog, sourcing lock, 45m timer.
S9  Reset: /weekly-review wizard, 4 steps, metrics computed from S2 data,
    promote-one constraint, Friday banner on Today.
S10 Live: deploy; 5 consecutive real mornings under 10 minutes each is the
    acceptance test for the entire MVP.

Tests per increment: unit-test invariants (one ★/day, sourcing threshold,
queue sorting, week-window math, promote-one rule); one Playwright happy path
grown incrementally: morning plan → place chips → log action → ship queue
item → complete reset.
```

## Frozen until Day 30 of real use

Recipient gate and 80% interrupt · data-fed stepper · shutdown strip · Patterns in-app (default answer: never — PATTERNS.md wins) · Touch list (default: never — the sheet wins) · override logging · reset hard-enforcement · calendar/email anything · Phase 3 entirely.

Day-30 rule: a frozen item gets built only if its absence caused a specific, named failure during the 30 days. "Would be nice" is not a failure.
