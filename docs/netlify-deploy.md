# Netlify Deploy

Netlify is a good fit if you want the app hosting experience to feel simpler than Railway.

Important tradeoff:

- Netlify hosts the app well
- Netlify does **not** provide the production Postgres database for this app
- you still need an external Postgres provider such as Neon or Supabase

## Recommended setup

- `Netlify` for the Next.js app
- `Neon` for PostgreSQL

## Environment variables

Set these in Netlify:

```env
DATABASE_URL=postgresql://...
PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=https://your-site.netlify.app
DEFAULT_USER_EMAIL=admin@example.com
DEFAULT_USER_PASSWORD=change-this
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=primary
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_SHEET_NAME=
GOOGLE_DAILY_BRIEF_EMAIL_TO=
FEATURE_GOOGLE_CALENDAR=true
FEATURE_GMAIL_TRIAGE=true
FEATURE_DAILY_BRIEF_AUTOSEND=true
DAILY_BRIEF_TIMEZONE=America/Los_Angeles
DAILY_BRIEF_SEND_HOUR=6
DAILY_BRIEF_SEND_MINUTE=30
```

## Build settings

The repo now includes:

- build command in [netlify.toml](../netlify.toml): `npm run netlify:build`
- Next.js support via Netlify's OpenNext adapter
- a scheduled function in [daily-brief-scheduled.ts](../netlify/functions/daily-brief-scheduled.ts)

`npm run netlify:build` does three things:

1. pushes the schema to Postgres
2. seeds the default user and default domains
3. builds the Next.js app

## Daily Brief autosend

Netlify Scheduled Functions are used instead of a separate cron service.

- schedule: every 15 minutes
- the app still enforces `America/Los_Angeles` and the `6:30 AM` send window internally
- `DailyBriefDispatch` prevents duplicate sends

## First deploy check

1. Connect the repo to Netlify.
2. Set the environment variables.
3. Deploy.
4. Log in.
5. Open `/daily-brief`.
6. Send a test email.

If autosend is enabled, Netlify will handle the scheduled trigger from the function.
