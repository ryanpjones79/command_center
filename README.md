# Daily Action OS

Task-first companion web app for your emailed Daily Brief.

The Daily Brief stays in email. This app is the writeback and execution layer:

- printable 1-page Action Sheet
- Follow-Up / Waiting visibility
- Weekly Review / Project Control
- low-friction task and project maintenance

Legacy market-tool routes from the earlier Strat dashboard are still preserved, but they are no longer the primary navigation.

## Primary Views

- `/`
  Daily Command Center and printable Action Sheet
- `/print/action-sheet`
  Dedicated print artifact with compact one-page and extended two-page modes
- `/weekly-review`
  Weekly Review and project control
- `/tasks`
  Full task list maintenance
- `/projects`
  Project list and domain maintenance
- `/settings`
  Architecture notes, field mapping, and legacy route access

## Data Model

The new execution layer uses:

- `ExecutionDomain`
- `ExecutionProject`
- `ExecutionTask`

This keeps the daily workflow task-first while still allowing weekly project review.

Notable execution-layer features:

- `pinToTodayUntilDone` for tasks that should stay visible across multiple days
- project-aware task filters and bulk triage actions
- follow-up bump actions for waiting items
- dedicated compact and extended print modes

## Local Run

1. Install dependencies

```bash
npm install
```

2. Set env vars

```bash
cp .env.example .env
```

3. Run migrations and seed

```bash
npm run prisma:migrate
npm run prisma:seed
```

4. Start the app

```bash
npm run dev
```

5. Login with:

- `DEFAULT_USER_EMAIL`
- `DEFAULT_USER_PASSWORD`

## Useful Commands

```bash
npm run build
npm run test
npm run migrate:legacy-execution
```

## Railway Deploy

Railway is the cleanest single-place host for this app: one project, a web service, a PostgreSQL service, and a small cron service for the Daily Brief.

Deployment notes:

- local development still uses SQLite via `prisma/schema.prisma`
- Railway production should use Postgres via `prisma/schema.postgres.prisma`
- the repo now auto-selects the Prisma schema based on `PRISMA_SCHEMA_PATH` or the `DATABASE_URL`
- use `npm run railway:web:predeploy` on the web service before deploy to bootstrap Postgres schema and seed the default user
- use `npm run railway:cron:start` as the cron service start command

Full setup steps live in [docs/railway-deploy.md](docs/railway-deploy.md).

## Notes

- Print styles are optimized for the Action Sheet on standard letter paper.
- PHI guardrails are still enforced on execution writeback fields.
- Architecture and migration notes live in [docs/action-sheet-redesign.md](docs/action-sheet-redesign.md).
