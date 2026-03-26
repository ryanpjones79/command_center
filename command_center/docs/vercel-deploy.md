# Vercel Deploy

Vercel is the cleanest deploy path for this app because the project is already a standard Next.js App Router app.

Recommended setup:

- `Vercel` for the app
- `Neon` through the Vercel Marketplace for Postgres
- `Vercel Pro` if you want the 15-minute Daily Brief cron to stay enabled

## Vercel project setup

When you import the GitHub repo into Vercel:

- Framework preset: `Next.js`
- Root directory: `command_center`
- Build command: leave it alone if Vercel reads [vercel.json](../vercel.json)

The app folder includes [vercel.json](../vercel.json), which sets:

- `framework = nextjs`
- build command = `npm run vercel:build`
- cron schedules for nightly refresh and Daily Brief autosend

## Environment variables

Add these in Vercel Project Settings -> Environment Variables:

```env
PRISMA_SCHEMA_PATH=prisma/schema.postgres.prisma
NEXTAUTH_SECRET=replace-with-a-long-random-secret
NEXTAUTH_URL=https://your-project.vercel.app
DEFAULT_USER_EMAIL=admin@example.com
DEFAULT_USER_PASSWORD=change-this
CRON_SECRET=replace-with-a-random-secret
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

- `DATABASE_URL` should come from your Neon integration or Neon project
- the production app should use `prisma/schema.postgres.prisma`
- `CRON_SECRET` is recommended because Vercel automatically sends it as a `Bearer` token for cron requests when present

## What the Vercel build does

`npm run vercel:build` does three things:

1. pushes the Prisma schema to Postgres
2. seeds the default user and default execution domains
3. builds the Next.js app

## First deploy check

1. Import the repo in Vercel.
2. Set Root Directory to `command_center`.
3. Connect Neon from the Marketplace or paste a Neon `DATABASE_URL`.
4. Add the environment variables.
5. Deploy.
6. Open `/login`.
7. Log in with `DEFAULT_USER_EMAIL` and `DEFAULT_USER_PASSWORD`.
8. Open `/daily-brief` and send a test email.

## Cron jobs

The cron schedules are defined in [vercel.json](../vercel.json).

- `/api/cron/nightly`
- `/api/cron/daily-brief`

Vercel cron jobs run only against the production deployment.

Important:

- Vercel's docs say cron jobs are available on all plans, but Hobby is limited to once-per-day schedules with hourly precision
- this repo currently includes a `*/15 * * * *` Daily Brief cron, which is intended for a reliable 6:30 AM local send window
- if you stay on Hobby, deployment can fail because that cron runs more than once per day
- if you want autosend to stay reliable, use Vercel Pro
- if you want to stay on Hobby, remove the Daily Brief cron and use manual send from `/daily-brief`
