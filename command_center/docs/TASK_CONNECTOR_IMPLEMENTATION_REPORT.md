# Task connector implementation report

2026-10-03. Implemented locally inside the existing RyanOS `command_center`. Production and existing local user databases were not inspected or modified. The connector is not deployed, configured, or registered in the parent runtime. There are no saved real tasks or live task links from this work.

## Outcome

- Existing-model task create/read/update plus minimal owned Area/Project discovery; no new tracker, paid service or dependency.
- Existing NextAuth session support and a disabled-by-default, expiring task-only bearer configuration for one owner and explicit owned Area IDs. Read permission is required; create/update can be enabled separately.
- Dependency-free stdio MCP adapter with five task tools. A real adapter subprocess was tested against authenticated loopback HTTP and the isolated synthetic Prisma database.
- Stable per-owner source keys, one-time adoption of matching manual tasks, concurrent duplicate protection, reviewed provenance assertion, compact summaries with separate detail reads, append-only references and version-checked patches.
- Done/Dropped work remains closed through the connector; owner edits, unrelated fields, references and scheduling are preserved. Recurrence calculation is shared with the existing UI; API completion is atomic and replay safe.
- Product simplification proposal only; time blocking, daily snapshot and review were not redesigned.

## Exact changed files

Paths below are relative to `command_center/`.

| File                                                                       | Change                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `app/api/task-connector/catalog/route.ts`                                  | Authenticated permitted catalog route                                                         |
| `app/api/task-connector/tasks/route.ts`                                    | Authenticated list/create routes                                                              |
| `app/api/task-connector/tasks/[id]/route.ts`                               | Authenticated read/patch routes                                                               |
| `lib/task-connector-contract.ts`                                           | Strict field validation, reviewed provenance assertion, bounded contract/errors               |
| `server/task-connector-auth.ts`                                            | Session/origin checks and scoped/expiring bearer validation                                   |
| `server/task-connector-http.ts`                                            | Bounded JSON body, safe errors, uncached responses, handler wiring                            |
| `server/task-connector-service.ts`                                         | Owned task operations, source-key identity/adoption, transactions, optimistic conflict checks |
| `server/task-connector.ts`                                                 | Existing auth/Prisma and app cache integration                                                |
| `server/execution-task-recurrence.ts`                                      | Shared next-occurrence calculation extracted from the existing UI                             |
| `app/execution-actions.ts`                                                 | Uses that shared recurrence calculation; 4 lines added, 94 removed                            |
| `prisma/schema.prisma`                                                     | Optional `integrationSourceKey` and owner/key unique index                                    |
| `prisma/schema.postgres.prisma`                                            | Same model change, aligned with SQLite                                                        |
| `prisma/migrations/20261003000000_task_connector_source_key/migration.sql` | Reviewable SQLite schema migration, unapplied to existing user databases                      |
| `prisma/postgres-migrations/20261003000000_task_connector_source_key.sql`  | Corresponding PostgreSQL SQL, unapplied                                                       |
| `scripts/task-connector-mcp.mjs`                                           | Local stdio adapter; no listener, redirect following or secret output                         |
| `tests/task-connector.test.ts`                                             | 16 invented-fixture auth/service/HTTP/recurrence/end-to-end tests                             |
| `tests/task-connector-mcp.test.ts`                                         | 3 protocol/mapping/configuration/secret-suppression tests                                     |
| `docs/TASK_CONNECTOR.md`                                                   | Exact API, scope, provenance, local parent access and activation plan                         |
| `docs/DAILY_ACTION_OS_SIMPLIFICATION_PROPOSAL.md`                          | Source-based product review and smallest next UI slice                                        |
| `docs/TASK_CONNECTOR_IMPLEMENTATION_REPORT.md`                             | This evidence and changed-file inventory                                                      |

The pre-existing `server/agent/project-tools.ts` modification, untracked handoff and unrelated work/healthcare artifacts were preserved. No accounts, settings, scheduler, task records, key/grant files, package manifests or lockfiles were changed. No commit was created.

## Verification evidence

| Check                                           | Result                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| SQLite Prisma schema validate                   | Passed with an explicitly synthetic file URL                                                           |
| PostgreSQL Prisma schema validate               | Passed with a synthetic connection URL; no PostgreSQL connection attempted                             |
| Prisma client generate                          | Passed locally                                                                                         |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed on the final code                                                                               |
| `npm test`                                      | 33 test files, **266 tests passed**, including **19 new connector tests**                              |
| `npm run build`                                 | Passed compile, lint/type validation, static-page generation and tracing; all three new routes present |
| `git diff --check`                              | Passed; Git emitted line-ending normalization notices                                                  |

The final full test run took 17.63 seconds. Tests use a fresh temporary SQLite file, invented owners/Areas/Projects/tasks, an explicit datasource override and a fixed synthetic test credential. Cleanup is confined to that created temporary directory. Coverage includes missing/invalid/expired auth; bearer/cookie separation; cross-origin/session write denial; read-only scope; owner/Area/Project isolation including inconsistent legacy relations; sequential/concurrent creates; adoption conflicts; user-edit and unrelated-field preservation; reference preservation; stale version failures; terminal transitions; recurrence calendar rules and replay; unknown fields and size/date/provenance validation; safe cache/error handling; actual stdio-to-HTTP-to-Prisma create/read/update.

Known verification limits: PostgreSQL runtime transactions and migration execution were not exercised against a PostgreSQL server; production host/session/data/access were not checked. The existing build emits warnings about old Browserslist data and missing Next.js ESLint plugin detection; these do not fail the build. The existing app databases need the approved schema migration **before** running this new Prisma client against them. Migration files were prepared but not applied there.

## Required next setup

Review/approve the migration and deployment on the confirmed existing host. Then privately configure one expiring task credential digest, Ryan's authenticated owner ID, an explicit owned Area allowlist and read-only permissions. Register the adapter with the token privately forwarded in the parent-accessible local execution environment; verify catalog/list/read. Only after approval enable create/update and reconcile real actions. Exact steps and non-secret configuration example are in `TASK_CONNECTOR.md`.

A hosted parent does not inherit local MCP configuration. If it cannot call the configured local tools directly, it must delegate to that configured local environment. No remote hosted MCP/plugin server was implemented or implicitly installed.

## Product recommendation

The smallest next implementation is a compact default `/tasks` view with Area filters, Ready/Waiting-or-Blocked/Later presets, brief creation and expandable details; retain existing advanced maintenance/history. Preserve the existing time-block grid, snapshot data and review workflows. Daily notes/photos/screenshots can first be reviewed in conversation and reconciled through the same task interface with stable provenance, without OCR, a scheduler or a second inbox database.
