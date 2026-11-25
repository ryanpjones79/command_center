# Remote RyanOS task MCP: implementation and activation

2026-10-03. The remote implementation is now in the existing `command_center` app. It is locally verified and disabled by default. It has not been deployed or connected to the cloud parent. The Tasks UI proposal remains parked.

**Follow-up verification complete:** actual PostgreSQL 17.11 migration/runtime/rollback and seed behavior have now been exercised on invented isolated data. The Vercel build was corrected to omit database push/seed. See [PostgreSQL checkpoint and activation command](TASK_CONNECTOR_POSTGRES_CHECKPOINT.md) for current evidence and approval scope. Statements below describing PostgreSQL verification as pending or the earlier Vercel script are historical to the first implementation pass.

## Existing host and repository evidence

The parent verified the public login at `https://daily-action-os.vercel.app`; Ryan confirmed the app already uses Railway/Vercel. Use that existing Vercel origin for the task connection. No new app, host, tunnel, or host migration is proposed.

Repository `vercel.json` explicitly selects Next.js and `npm run vercel:build`. Its package script currently runs `prisma:deploy:bootstrap` (database push plus seed) before build. The checked-in Railway configuration uses `npm run build`; the package also has a Railway predeploy bootstrap script. No local `.vercel/project.json` or `.railway` directory was found identifying the active account/project. The exact Vercel project connection, active branch, database provider and Railway predeploy settings therefore need confirmation in the existing hosting dashboard before deployment. Private env files were not inspected.

## Implemented routes and behavior

| Route | Behavior |
| --- | --- |
| `/api/mcp/tasks` | Authenticated, stateless Streamable HTTP MCP POST; GET/DELETE 405 |
| `/.well-known/oauth-protected-resource/api/mcp/tasks` | Protected-resource discovery |
| `/.well-known/oauth-authorization-server` | Root issuer metadata, PKCE S256, public `none` exchange, CIMD |
| `/api/mcp/oauth/authorize` | Validate one approved client/resource/redirect; preserve login return; show owner consent |
| `/api/mcp/oauth/consent` | Same-origin, session/nonce-protected approval or denial |
| `/api/mcp/oauth/token` | Atomic single-use authorization-code redemption with PKCE |
| `/api/mcp/oauth/revoke` | Individual access-token revocation |
| `/task-access` | Owner's active connection summaries and revoke controls |
| `/api/mcp/oauth/owner-revoke` | Session/nonce-protected grant revocation |

The five tools share `scripts/task-tool-definitions.mjs` with the PC adapter and call the existing task service. No competing task store is created. MCP returns canonical task URLs and retains validation, owned Area/project isolation, source-key dedupe, owner edits/references, version checks and closed-task rules. Read-only grants deny create/update; write tools advertise their required scopes and authorization challenge.

OAuth reuses RyanOS credentials login for human consent. The owner selects Areas and permissions explicitly; writes are initially unchecked. An approved grant and its token expire after the configured finite lifetime (5 minutes through 24 hours). There is no refresh token or background renewal. Reauthorization can be completed from ChatGPT/RyanOS in a browser; the PC task runtime is not required. The consent page states the lifetime and links the access-control location.

Authorization codes and access tokens use cryptographic randomness at execution time; only hashes are stored. No production credential was generated. Codes last two minutes after consent and are atomically consumed. Pending consent requests expire in ten minutes. The existing database adds four access tables: grants, pending/code bindings, hashed tokens, and durable throttle counters. Owner/Area/operation/resource/client bindings, expiry and revocation are checked on every tool execution. No client registration, arbitrary metadata fetching, external OAuth provider, OIDC profile scope, JWT signing infrastructure or offline access is added.

## Exact reviewed configuration

These are variable names and public candidate values, not settings already applied. No value was written to a host or secret file.

| Variable | Required value/action |
| --- | --- |
| `RYANOS_MCP_ENABLED` | Keep absent/false during deployment and review; set `true` only with activation approval |
| `RYANOS_MCP_ORIGIN` | `https://daily-action-os.vercel.app`, if confirmed as the app's canonical origin |
| `RYANOS_MCP_OWNER_ID` | Ryan's existing User cuid, resolved privately from the signed-in app |
| `RYANOS_MCP_DOMAIN_IDS` | Comma-separated existing owned Area cuids; explicit allowlist, maximum 20 |
| `RYANOS_MCP_SCOPES` | Start `tasks:read`; after approved write activation, `tasks:read,tasks:create,tasks:update` |
| `RYANOS_MCP_CLIENT_ID` | Stable candidate `https://chatgpt.com/oauth/client.json`; confirm the connection uses this CIMD mode |
| `RYANOS_MCP_REDIRECT_URI` | Stable candidate `https://chatgpt.com/connector_platform_oauth_redirect`; copy/confirm the connection's exact displayed URI |
| `RYANOS_MCP_GRANT_TTL_SECONDS` | Owner-approved integer 300-86400; explicitly choose the lifetime |

The [public OpenAI client document](https://chatgpt.com/oauth/client.json), fetched on this date, lists that stable callback and public token exchange `none` alongside `private_key_jwt`. The implementation advertises only `none` and requires PKCE, so no per-client secret is needed. A callback-specific OpenAI document and callback are supported only when they are the exact approved configuration and the fetched document lists that callback. [OpenAI authentication documentation](https://developers.openai.com/plugins/build/auth) describes this flow and copying the connection's exact redirect.

The connector intentionally accepts no app cookie or the PC bearer token for MCP task calls. The existing `RYANOS_TASK_CONNECTOR_*` PC bearer settings are separate and need not be enabled to use this remote flow. Existing NextAuth/database deployment settings must remain valid; do not disclose them in chat.

## Migration and release review

Prepared, unapplied SQL:

- SQLite: `prisma/migrations/20261003010000_task_remote_oauth/migration.sql`.
- PostgreSQL: `prisma/postgres-migrations/20261003010000_task_remote_oauth.sql`.
- The previously prepared `20261003000000_task_connector_source_key` migration is also required if not already present.

The new SQL is additive: four tables, indexes and ownership/grant foreign keys. Schema-file migration diffs were generated without database connections. The SQLite OAuth SQL was applied only to an in-memory invented fixture and preserved its existing task. PostgreSQL runtime transactions and its migration were not executed. Before release, validate both migrations against an approved isolated PostgreSQL staging database if that is the active production provider.

Do not trigger a Vercel deployment while treating its bootstrap as a harmless build. Review the current push/seed step, database state, backup/rollback and migration sequence in the existing deployment workflow. This pass did not change those scripts or production settings. Independent authentication review is required before owner activation because this is new authorization code, even though its local tests pass. Existing dependency advisories also need the app's normal release assessment; `npm audit` found no advisory node among the 65 newly added package paths.

## Verification performed

- Both Prisma schemas validate; Prisma generation and TypeScript checks pass.
- Full suite: 34 files, 283 tests passed, including 17 new remote/auth tests and the 19 earlier task/API/stdio tests.
- Local production build passes and lists all nine new routes, including `.well-known` discovery paths.
- Synthetic tests cover disabled/invalid config, exact CIMD/callback validation, bounded metadata fetching, PKCE, code replay/concurrent redemption, owner/Area/scopes, consent nonce and Origin, concurrency limits, code/token hashing, pending/code/token expiry, owner/token revocation, finite throttling, safe login return, SDK initialization/discovery, read-only write denial, task create/dedupe/list/read/version-update/closed state, canonical links, payload bounds and safe errors.
- SQLite migration adds only the four expected access tables and preserves an invented preexisting task.

No live task, actual access grant, production security configuration or deployment was changed. Local tests establish code behavior, not successful cloud-parent connection. Existing nonblocking build messages remain about Browserslist age and Next ESLint plugin detection.

## Owner activation steps

1. **Review this implementation and the authentication boundary.** Confirm the existing Vercel project/branch and its database provider; obtain the authentication review and applicable staging database verification. Approve the controlled migration/deployment sequence, including the existing bootstrap behavior.
2. **Approve migration/deploy on that existing project.** Keep MCP disabled initially. Apply the reviewed source-key and OAuth migrations in the chosen provider's workflow and deploy the reviewed code. This is a separate action; no deployment has occurred here.
3. **Approve the access configuration.** Privately resolve Ryan's User ID and actual Area IDs from the authenticated app; use the existing authenticated task catalog for Areas. Choose explicit Areas and lifetime, confirm the public CIMD/callback values, and configure the variables above through the existing host. Start with read permission. Provision no shared API/client secret for this flow.
4. **Connect the cloud parent's account to `https://daily-action-os.vercel.app/api/mcp/tasks`.** Select Streamable HTTP/OAuth and CIMD where offered. Ryan signs into RyanOS and grants selected read access. Verify the tools become callable in the actual parent chat and catalog/list/read return only the chosen owned Areas. A local/other-account connection is insufficient evidence.
5. **Authorize writes after read verification.** Approve adding create/update scopes, reauthorize through owner consent, and separately authorize one bounded task reconciliation. The parent creates or adopts only missing reviewed work, reads back results, tests a version-checked update and returns the task link. Check denied out-of-scope access and revocation. Only then report direct parent access ready.

If the actual account rejects write tools, preserve the implementation disabled/read-only and report that concrete rejection. The earlier official Pro documentation conflict remains recorded in the feasibility snapshot; it is not a reason to stop the authorized code work or recommend an account upgrade without actual evidence.
