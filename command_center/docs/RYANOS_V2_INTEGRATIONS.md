# RyanOS v2 integrations and handoffs

RyanOS **receives** actions and results and links back to the source. It never writes to another system: no buying, betting, messages, listing changes or trading settings. The one exception, approved by Ryan on 2026-11-22, is **Google Calendar time blocks**: RyanOS writes its own scheduled tasks to his calendar and follows moves he makes there (below). It never edits or deletes any other event.

## Status

| Source | Path into RyanOS | Status |
|---|---|---|
| Rykas (Amazon / Supplier OS) | Agent HQ's persisted read → `syncRykas` → actions keyed `RYKAS:<card id>` | **Live** when `FEATURE_RYKAS_TRUTH_READ` and the Windows runner are on. Items missing from a fresh reading are marked GONE, never done. |
| AP Trader | Existing `/status.json` feed (token-protected) → `syncApTrader` → incidents | **Live** (uses `AP_TRADER_STATUS_URLS` and `AP_TRADER_READ_TOKEN`). An incident resolves only when a fully successful reading shows the condition cleared. |
| Starred Gmail | `syncStarredEmail` (metadata only: subject and sender; bodies are never read) | **Not connected.** Needs `FEATURE_GMAIL_CAPTURE=true` and a Google grant that includes `https://www.googleapis.com/auth/gmail.readonly`. The current bootstrap grants only `gmail.send`: add the scope in `scripts/google-auth-bootstrap.mjs`, re-run consent, and update `GOOGLE_REFRESH_TOKEN`. Senders on `RYANOS_EMAIL_BLOCKED_DOMAINS` (default `cdcr.ca.gov,cchcs.ca.gov`) are skipped. |
| eBay workstation | `POST /api/v2/ingest` | **Live** since 2026-11-22: the Supplier OS backend sends every morning after 6 a.m. Pacific, in four eBay projects. |
| Google Calendar time blocks (two-way) | `server/v2/calendar-sync.ts`, run when Plan opens, after each Plan change and with the 5-minute cron | **Built, off.** Needs `FEATURE_GOOGLE_CALENDAR_WRITE=true` and a Google grant with `https://www.googleapis.com/auth/calendar.events` (now in `scripts/google-auth-bootstrap.mjs`; re-run consent and update `GOOGLE_REFRESH_TOKEN`). Each scheduled task is one private event with a fixed id (`r0` + hex task id) and private property `ryanosTaskId`. Moving or deleting it in Google moves or unschedules the task; the later edit wins. Done tasks keep their event; dropped or unscheduled tasks lose it. Other events are never touched. Failures show on Plan and as source `GOOGLE_CALENDAR`. |
| Store route | `POST /api/v2/ingest` | **Waiting on the store-route app** (handoff below) |
| Casino AP (AP Field Book, https://ap-fieldbook-production.up.railway.app/) | Field Book server sender to `POST /api/v2/ingest` | **Built, off** (`Desktop\AP Casino`, local git, see its `docs/ryanos-feed.md`): offers (deadline = window end, Used/Passed = done), must-hit progressive plays and re-checks, inventory checks, and weekly sessions / hours / net-per-hour goals. Needs a deploy plus `FEATURE_RYANOS_EMIT` and a CASINO_AP token. |
| CCHCS | Personal, PHI-free tasks in the Work domain only | No automated feed by design. Any future feed must be filtered **before** it reaches RyanOS, in the approved environment. |
| Phone capture (iPhone) | Shortcut → `POST /api/v2/capture` | Needs `RYANOS_CAPTURE_TOKEN` (32+ random characters) set in Railway |
| Phone capture (Android) | Install the app from Chrome → Share → RyanOS | Built in (`app/manifest.ts`, `/inbox/share`) |

## Inbound contract: `POST /api/v2/ingest`

`Authorization: Bearer <token>`. Tokens are in `RYANOS_INGEST_TOKENS`, a JSON map of system to token (24+ characters each), for example `{"EBAY":"…","STORE_ROUTE":"…","CASINO_AP":"…"}`. A token may only post events for its own system; anything else is rejected. The body is at most 512 KB:

```json
{
  "events": [{
    "version": 1,
    "system": "EBAY",
    "sourceId": "lot-7:photos",
    "kind": "ACTION",
    "state": "OPEN",
    "title": "Photograph lot 7",
    "doneWhen": "All 12 items photographed",
    "dueAt": null,
    "expiresAt": null,
    "durationMinutes": 45,
    "workContext": "HOME",
    "url": "https://<ebay app>/lots/7",
    "projectKey": "lot-7",
    "projectName": "Lot 7 listings",
    "goalKey": "listings-live",
    "successorSourceId": "lot-7:upload",
    "observedAt": "2026-11-23T17:00:00Z"
  }],
  "goals": [{ "sourceKey": "listings-live", "title": "eBay listings live", "measureKind": "OUTCOME", "metricName": "Listings live", "metricDefinition": "Active listings reported by the eBay app", "unit": "listings", "target": 40, "period": "WEEK", "url": "https://<ebay app>/goals" }],
  "results": [{ "goalSourceKey": "listings-live", "periodStart": "2026-11-23T08:00:00Z", "periodEnd": "2026-11-30T08:00:00Z", "value": 31, "observedAt": "2026-11-24T18:00:00Z" }]
}
```

Field rules:
- **`kind`:** ACTION (work), INCIDENT (stays open after local inspection until you send RESOLVED), or OFFER (set `expiresAt`).
- **`state`:** OPEN, RESOLVED (source-verified completion), GONE (no longer shown, which is not completion), or UNKNOWN.
- **`sourceId`:** must be stable for the obligation. Re-sending the same event is safe.
- **New obligation on the same id:** send a new `revision` or `reopen: true`; a new `observedAt` alone won't reopen handled work.
- **`url`:** must be https and point at the exact record.
- **`successorSourceId`:** names the next step. It stays blocked until this step is done, then activates.
- **`needsJudgment: true`:** when meaning or timing is unclear. The item goes to the Inbox instead of the proposed plan.
- **Results:** source-verified, one per goal and period. They never come from RyanOS task completion.

The response lists each key's decision (CREATE, UPDATE_SOURCE, IGNORE_HANDLED, REOPEN, SOURCE_RESOLVED, IGNORE_STALE or REJECTED).

## Handoffs

**eBay workstation owner**
1. Generate a token and store it as both `RYANOS_INGEST_TOKENS.EBAY` (Railway, `command_center`) and the eBay app's own secret.
2. Emit one ACTION per useful step (photograph, write up, upload) with `successorSourceId` chaining the steps and `projectKey` per lot.
3. Send RESOLVED only when the eBay app verifies a step, for example a listing that is actually live.
4. Report `listings-live` (OUTCOME) and any sales goals as results. **Don't** send sales inside a Rykas aggregate as well, to avoid double counting.

**Store-route owner**
- Emit ERRAND actions per route stop (`workContext: "ERRAND"`, `durationMinutes` including shopping, `url` to the stop).
- Use `expiresAt` for clearance windows.
- Travel planning stays in the route app; RyanOS adds 15 minutes of travel padding when placing errands.

**Casino AP owner**
- Emit OFFER events with `expiresAt` and a `doneWhen` such as "Free play used or passed".
- Passing on an offer is a local decision in RyanOS (Move → Drop) and doesn't change the source offer.
- Qualification and opportunity analysis stay in the Casino AP tool.

## iPhone Shortcut (capture in one tap)
1. Shortcuts → New → "Ask for Input" (Text) → "Get Contents of URL".
2. URL: `https://commandcenter-production-264d.up.railway.app/api/v2/capture`. Method: POST. Header: `Authorization: Bearer <RYANOS_CAPTURE_TOKEN>`. Request body: JSON `{ "text": <Provided Input> }`.
3. Add "Show Result" so the receipt (or the error) is visible. A failed save says so; nothing is silently lost.
4. Optional: turn on "Show in Share Sheet" and pass the Shortcut Input as text to capture selected text or links.

## Cron
`/api/cron/now-alerts` (every ~5 min, `Authorization: Bearer $CRON_SECRET`) runs the throttled source syncs, then block alerts.
- Add `?dryRun=1` to list what would be sent without sending or recording anything.
- Alerts are deduplicated in `AlertDelivery` and respect quiet hours (`UserSettings.quietStartMin` and `quietEndMin`) and protected time.
