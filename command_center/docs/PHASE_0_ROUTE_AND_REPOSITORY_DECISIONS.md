# Phase 0 Route And Repository Decisions

Date: 2026-08-03

## Decisions Applied

- RyanOS owns `/`. Authenticated users are redirected to `/time-blocks`; unauthenticated users are redirected to `/login`.
- The authenticated app shell is RyanOS-only. It uses `AppShell` directly and no longer depends on the marketing `RootShell`, marketing fonts, or marketing metadata.
- Primary RyanOS navigation is: RyanOS, Daily Brief, Weekly Review, Tasks, Projects, Settings.
- Mobile primary navigation is: Today, Brief, Tasks, Review.
- The Action Sheet is preserved as the secondary `/dashboard` route and is no longer linked through `/`.
- Daily Brief remains functional and its "Open Action Sheet" link now points to `/dashboard`.
- Legacy market tool routes remain available temporarily but are not part of the primary RyanOS navigation.

## Local Marketing Work

Public Rykas marketing work exists locally and should move to a separate repository or deployment. Phase 0 does not delete it and does not integrate it into RyanOS.

Observed local marketing-related paths include:

- `app/about`
- `app/amazon-launch`
- `app/assessment`
- `app/channel-control`
- `app/contact`
- `app/results`
- `app/services`
- `app/strategy`
- `components/marketing`
- `content`
- `lib/marketing`

The untracked `components/layout/root-shell.tsx` is treated as part of that local marketing separation work and is not used by the RyanOS root layout after Phase 0.

## Route Ownership

- `/` is a redirect boundary only.
- `/time-blocks` is the main RyanOS Today execution screen.
- `/daily-brief` stays available.
- `/dashboard` is the secondary Action Sheet surface.
- `/weekly-review`, `/tasks`, `/projects`, and `/settings` stay available as supporting RyanOS screens.
- `/chart`, `/signals`, `/watchlist`, and `/market-settings` are temporary legacy market tool routes. They remain functional if reached directly but are hidden from the primary RyanOS app navigation.

## Regression Coverage

Phase 0 adds route ownership tests for:

- Authenticated root redirect target.
- Unauthenticated root redirect target.
- Primary RyanOS route page availability.
- Secondary Action Sheet route availability.
- Legacy market routes staying outside primary navigation.

## Not In Phase 0

- No Prisma schema changes.
- No Daily Brief rewrite.
- No Today screen redesign.
- No Hybrid V2 feature implementation.
- No external integrations.
- No deletion of local marketing files or user data.
