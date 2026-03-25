# Railway Deploy

This app is ready to run on Railway as one project with three services:

- `web` for the Next.js app
- `postgres` for the production database
- `cron` for the Daily Brief autosend trigger

## Why the setup looks like this

- local development still uses SQLite via `prisma/schema.prisma`
- Railway production should use PostgreSQL via `prisma/schema.postgres.prisma`
- the repo now auto-selects the Prisma schema from `PRISMA_SCHEMA_PATH` or `DATABASE_URL`
- existing Prisma migration SQL was generated against SQLite, so the first Railway bootstrap path uses `prisma db push` instead of `prisma migrate deploy`

That keeps production simple now and avoids trying to replay SQLite-native SQL on Postgres.

## 1. Create the Railway project

1. Create a new Railway project from this GitHub repo.
2. Set the service root directory to `command_center`.
3. Add a `PostgreSQL` service.
4. Add a second app service from the same repo and name it `cron`.
5. Generate a public domain for the `web` service.

## 2. Set shared environment variables

Set these at the project or production-environment level so both `web` and `cron` can read them:

```env
PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=https://your-app.up.railway.app
CRON_TARGET_URL=https://your-app.up.railway.app
CRON_SECRET=replace-with-a-long-random-secret
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

- `CRON_TARGET_URL` can match `NEXTAUTH_URL`
- if you attach a custom domain later, update both values
- keep the Google OAuth refresh token in Railway variables, not in repo files

## 3. Configure the web service

In the Railway dashboard for the `web` service:

- Build command: `npm run build`
- Start command: `npm run railway:web:start`
- Pre-deploy command: `npm run railway:web:predeploy`
- Healthcheck path: `/api/health`

What the pre-deploy command does:

- pushes the PostgreSQL schema with `prisma db push`
- seeds the default user and default execution domains

## 4. Configure the cron service

In the Railway dashboard for the `cron` service:

- Build command: `npm run build`
- Start command: `npm run railway:cron:start`
- Cron schedule: `*/15 * * * *`

Why every 15 minutes:

- Railway cron is UTC-based
- the app already enforces `America/Los_Angeles` send timing inside `/api/cron/daily-brief`
- the route is idempotent through `DailyBriefDispatch`, so it only sends once inside the local send window

This keeps `6:30 AM Pacific` stable through daylight saving changes without hard-coding UTC offsets.

## 5. First deployment check

After the first `web` deploy:

1. Open the Railway domain.
2. Log in with `DEFAULT_USER_EMAIL` and `DEFAULT_USER_PASSWORD`.
3. Open `/daily-brief`.
4. Send a test Daily Brief email.
5. Check Railway logs for both `web` and `cron`.

## Current limitation

The production bootstrap path currently relies on `prisma db push` because the checked-in SQL migrations were created for SQLite. Before making heavier production schema changes later, cut dedicated PostgreSQL migrations so production can move to `migrate deploy`.
