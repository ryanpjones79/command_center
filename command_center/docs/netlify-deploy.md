# Netlify Deploy

Netlify is the simplest hosted path for this repo now that the app lives in `command_center/`.

Recommended setup:

- `Netlify` for the Next.js app
- `Netlify DB` for the Postgres database

Netlify DB is powered by Neon. It keeps the workflow on one platform, but it is still beta and should be claimed after setup so it does not expire.

## Base directory

When you import the GitHub repo into Netlify, set:

- Base directory: `command_center`

## Environment variables

Set these in Netlify:

```env
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

Notes:

- `DATABASE_URL` should be created automatically by Netlify DB / Neon
- if Netlify only exposes `NETLIFY_DATABASE_URL`, the app and Prisma scripts now map that to `DATABASE_URL` automatically
- if `DATABASE_URL` is not present after the first deploy, open the site `Extensions` area and connect or claim the Neon database

## Build settings

The app folder includes:

- build command in [netlify.toml](../netlify.toml): `npm run netlify:build`
- Next.js support via Netlify's OpenNext adapter
- a scheduled function in [daily-brief-scheduled.ts](../netlify/functions/daily-brief-scheduled.ts)
- `@netlify/neon` in `package.json`, which allows Netlify to auto-provision the database during build

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
2. Set the base directory to `command_center`.
2. Set the environment variables.
3. Deploy.
4. Log in.
5. Open `/daily-brief`.
6. Send a test email.

If autosend is enabled, Netlify will handle the scheduled trigger from the function.
