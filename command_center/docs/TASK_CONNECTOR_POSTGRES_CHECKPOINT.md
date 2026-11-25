# PostgreSQL / Vercel validation checkpoint

2026-10-03. **Local verification complete; production activation remains unexecuted.** No real database/task, production credential/grant/configuration or deployment changed. UI work remains parked.

## Passed

- Real isolated PostgreSQL **17.11** with a separately generated PostgreSQL Prisma **6.4.1** client: **21 runtime tests pass**. They exercised the actual task/MCP/OAuth services, owner/Area isolation, read-only denial, PKCE/replay/expiry/revocation, concurrent duplicate creates, stale update conflicts and exactly one recurring successor.
- Exact SQL migrations preserve existing synthetic User/Area/task/reference data. Transactional partial DDL failure rolls back; duplicate apply fails closed; empty-schema rollback/reapply and provenance-only completion pass.
- The actual guarded migration command passes fresh/provenance-only schemas and rejects malformed provenance indexes, partial OAuth tables and repeated complete application without changing original tasks/Areas.
- Original seed execution on invented PostgreSQL data **overwrites custom owner Area metadata** and adds three projects, while preserving existing task/reference content and the foreign owner's data. Source review also finds a conditional legacy Rykas policy update.
- Corrected `vercel:build` is **`npm run build`**. It performs no db push or seed. **284 app tests / 35 files, TypeScript and the actual corrected Vercel production build pass.** Diff checks pass.
- Isolated loopback test server stopped. No installed PostgreSQL service was changed.

Evidence: `task-connector-verification/postgres-migration-results.json`, `postgres-guard-results.json`, `postgres-seed-results.json`; runtime inputs/scripts remain in the delegated workspace `pg-verification/`.

## Smallest approval request

Approve additive migrations and reviewed code deployment on **the existing Vercel project serving `https://daily-action-os.vercel.app`**, with its build correction and no overriding bootstrap/seed. Schema change: nullable task provenance key/owner unique index plus four OAuth grant/code/token/throttle tables. No owner/Area/task content changes, host migration, new app, external OAuth provider or unrelated deployment.

Approve existing Ryan User and **only existing Rykas/AP Sports Area IDs**, privately resolved from authenticated catalog, with **3600-second** access: read first; create/update only after read verification and Ryan's explicit write consent. No refresh/background renewal. No shared client/API secret: new access consists of a durable owner grant and hashed expiring code/token records in the same database. No real task write is implied by deployment approval.

## Commands after approval

Privately select the existing production target using libpq `PG*`/`PGSERVICE` settings; never paste its URL/password into chat/arguments. From `command_center`:

```powershell
psql -X --set=ON_ERROR_STOP=1 --command='SELECT current_database(), current_schema(), version();'
psql -X --set=ON_ERROR_STOP=1 --single-transaction --file=scripts/task-connector-postgres-apply.sql
npm test
npm run vercel:build
```

The guarded script requires the existing `public` schema; unexpected installed/partial states stop for review. Deploy the reviewed revision from the [existing Vercel project dashboard](https://vercel.com/dashboard), keeping MCP disabled initially. Confirm the selected project serves that domain; no local project binding was found, so do not use a blind CLI deploy that might select/create another project. Existing Railway/Netlify bootstrap scripts were not changed or authorized for deployment.

Required host values after review:

```text
RYANOS_MCP_ENABLED=true
RYANOS_MCP_ORIGIN=https://daily-action-os.vercel.app
RYANOS_MCP_OWNER_ID=<Ryan's existing User cuid>
RYANOS_MCP_DOMAIN_IDS=<existing Rykas cuid>,<existing AP Sports cuid>
RYANOS_MCP_SCOPES=tasks:read
RYANOS_MCP_CLIENT_ID=https://chatgpt.com/oauth/client.json
RYANOS_MCP_REDIRECT_URI=https://chatgpt.com/connector_platform_oauth_redirect
RYANOS_MCP_GRANT_TTL_SECONDS=3600
```

Keep `ENABLED=false` until approved activation. Vercel environment changes require the reviewed revision to be redeployed. Later writes use `tasks:read,tasks:create,tasks:update` and fresh owner consent. AP Sports ID must be resolved, not invented; no CCHCS/Personal/all-Area grant.

## Parent connection, final readiness and rollback

The [official connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt) specify Settings → Security and login → Developer mode, then [Plugins](https://chatgpt.com/plugins) → plus → private remote connection. Enter **`https://daily-action-os.vercel.app/api/mcp/tasks`**, Streamable HTTP, OAuth/CIMD. The [actual public OpenAI client document](https://chatgpt.com/oauth/client.json) lists the configured stable callback and public `none` exchange. Ryan completes RyanOS sign-in and selected Area/read consent; review discovered tools and select the connection in the actual parent chat (fresh chat if needed to bind tools).

Require all five callable names: `ryanos_task_catalog/list/read/create/update` (expanded individually with the `ryanos_task_` prefix). Parent catalog/list/read must verify real scope and denied writes under read-only consent. After approved write configuration/consent, one separately authorized bounded create/adopt/read/update/readback must return an actual task URL. Revoke through `https://daily-action-os.vercel.app/task-access` and verify denial. Documented connection steps are verified; authenticated account/tool binding is **not** yet verified. This runtime has no RyanOS tools available.

Production rollback: disable MCP, roll back code if needed and retain the additive schema/data. Do not drop provenance or populated grants to undo deployment. Provider-specific production schema/target, approval, consent and actual parent tool results are the remaining activation gates.
