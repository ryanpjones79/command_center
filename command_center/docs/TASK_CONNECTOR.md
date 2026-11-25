> **Moved to Railway (2026-11-25).** The remote task connector now runs on the live RyanOS app:
> MCP endpoint `https://commandcenter-production-264d.up.railway.app/api/mcp/tasks` (Streamable HTTP, OAuth).
> The old `daily-action-os.vercel.app` deployment is stale and should not be used. Railway settings:
> `RYANOS_MCP_ENABLED=true`, `RYANOS_MCP_ORIGIN=https://commandcenter-production-264d.up.railway.app`,
> `RYANOS_MCP_OWNER_ID` (Ryan's user), `RYANOS_MCP_DOMAIN_IDS` (Upwork & opportunities, Rykas, eBay, Betting Models),
> `RYANOS_MCP_SCOPES=tasks:read,tasks:create,tasks:update`, `RYANOS_MCP_CLIENT_ID=https://chatgpt.com/oauth/client.json`,
> `RYANOS_MCP_REDIRECT_URI=https://chatgpt.com/connector_platform_oauth_redirect`, `RYANOS_MCP_GRANT_TTL_SECONDS=86400`.
> The connector reads and writes tasks only in those existing Areas; it cannot create Areas. Its four tables
> (TaskOAuthGrant, TaskOAuthCode, TaskOAuthAccessToken, TaskOAuthRateBucket) are created by Railway's pre-deploy `db push`.

# RyanOS task connector — local implementation and activation plan

Prepared 2026-10-03. Code and synthetic tests are authorized. This implementation has not been deployed or enabled for real access. No real credentials, grants, production tasks, or account settings were created or changed.

RyanOS remains the single action store. The connector uses the existing `ExecutionTask`, `ExecutionDomain`, `ExecutionProject`, and `ExecutionTaskReference` records and existing validation/PHI guard. The only schema addition is an optional unique task provenance key, aligned in SQLite and PostgreSQL. It does not import a second tracker or grant machine execution.

## Parent access mechanism

`scripts/task-connector-mcp.mjs` is a dependency-free Node stdio MCP adapter. Its five tools are `ryanos_task_catalog`, `ryanos_task_list`, `ryanos_task_read`, `ryanos_task_create`, and `ryanos_task_update`. It sends authenticated requests only to the configured RyanOS origin, rejects non-loopback plain HTTP, refuses redirect following, and never emits the credential in tool output. It opens no inbound listener. Node 20 or later is required.

The API alone does not connect the parent. After separate setup approval, register this adapter in the parent's **local execution environment**, supply its two environment variables privately, refresh that environment's tool list, and verify that all five tools are callable. A hosted chat does not acquire these tools merely because this repository has code or local Codex has a config entry. If that hosted parent cannot use the registered local tools, the smallest supported workflow is for it to delegate task operations to the configured local Codex execution environment and receive verified task links. A direct hosted-chat remote MCP/plugin deployment is a separate extension; this implementation does not claim one exists.

Reviewable local Codex configuration, with no credential value in the file:

```toml
[mcp_servers.ryanos_tasks]
command = "node"
args = ["C:/Users/Ryan/Desktop/edads-MPages/strat-portfolio-builder/command_center/scripts/task-connector-mcp.mjs"]
env_vars = ["RYANOS_TASK_API_URL", "RYANOS_TASK_CONNECTOR_TOKEN"]
enabled_tools = ["ryanos_task_catalog", "ryanos_task_list", "ryanos_task_read", "ryanos_task_create", "ryanos_task_update"]
tool_timeout_sec = 20
```

`RYANOS_TASK_API_URL` is an approved origin, such as the confirmed production host or `http://127.0.0.1:3000` for an intentionally local app. It has no path/query/embedded credentials. `RYANOS_TASK_CONNECTOR_TOKEN` is the privately supplied task-only credential. Do not paste it into chat, command arguments, repo files, notes, or logs. This configuration was documented, not installed. See [official OpenAI MCP configuration guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) for stdio environment forwarding and the distinction between local clients and hosted chats.

## Authentication and exact scope

The API accepts either RyanOS's existing NextAuth session or a separately approved scoped bearer credential. Browser-session mutations require the exact app Origin header. Invalid bearer authentication never falls back to a cookie session. Cross-origin requests are denied; responses are private and uncached. No request-supplied owner ID is accepted.

Bearer access is disabled unless **all** these server settings are valid:

| Server environment variable        | Required meaning                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `RYANOS_TASK_CONNECTOR_ENABLED`    | Exactly `true`; absent/false disables bearer access                                           |
| `RYANOS_TASK_CONNECTOR_SHA256`     | Lowercase SHA-256 digest of the approved high-entropy credential, never the plaintext token   |
| `RYANOS_TASK_CONNECTOR_OWNER_ID`   | Ryan's existing authenticated user ID                                                         |
| `RYANOS_TASK_CONNECTOR_DOMAIN_IDS` | Comma-separated explicit owned Area IDs; no wildcard, at most 20                              |
| `RYANOS_TASK_CONNECTOR_OPERATIONS` | Explicit comma-separated `read,create,update` subset; must include `read`, defaults to `read` |
| `RYANOS_TASK_CONNECTOR_EXPIRES_AT` | Required future expiry timestamp; expired or invalid configuration denies access              |

This grants only operational task management for that owner inside those Areas. It cannot read account/password/settings data, notebooks, healthcare records, email, inventory, trade positions, or machine work records; it cannot send messages, purchase, trade, change projects/areas, schedule time blocks, delete tasks, or manage access. Project discovery returns only names, IDs, Area IDs and project status. Existing task notes in a permitted Area are part of task access: scope an Area only after confirming its task content is appropriate for Cyrus. CCHCS input must remain PHI-free and omit employee-sensitive content. The existing text guard is a heuristic, not a guarantee that arbitrary sensitive text is safe.

No bearer keys were generated or provisioned. After approval, Ryan or the deployment owner must choose/store the credential through the existing private deployment and local environment facilities. The server stores only its digest/configuration; the local adapter receives the token privately. Rotation replaces the digest and local token; revocation sets enabled false or removes the digest. Expiry is mandatory. This initial connector supports one configured owner/credential, not multi-user OAuth administration.

## API contract

All paths are relative to the approved app origin. Unsupported operations are not exposed.

| Method and path                              | Behavior                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/task-connector/catalog`            | Permitted owned Areas and Projects, minimal fields; creates no setup records                                                                                                                                                                                              |
| `GET /api/task-connector/tasks?domainId=...` | One Area; optional `q` searches title, `projectId`, `sourceKey`, exact `status`, `cursor`, `limit` (1–50, default 25). Includes Done/Dropped unless filtered. Returns compact task summaries (no details/reference bodies) and `nextCursor`; read a task for full context |
| `GET /api/task-connector/tasks/:id`          | Current task, owned reference cards, `updatedAt`, `taskPath`                                                                                                                                                                                                              |
| `POST /api/task-connector/tasks`             | Create one reviewed missing task or return its current existing record on source-key retry                                                                                                                                                                                |
| `PATCH /api/task-connector/tasks/:id`        | Reviewed, version-checked field patch plus optional append-only references and one-time source-key adoption                                                                                                                                                               |

Create requires `domainId`, `sourceKey`, `source`, `title`, and `reviewed: true`. Use the title as the short next action (2–120 characters), `note` for separate details (up to 1,000), and reference cards for source links (up to five per request, notes up to 500 each). Longer drafts should use an existing approved document/link; no document upload service is added. `source` is a brief human-readable provenance caption (2–180), and `sourceKey` is the stable identity (6–180 characters; letters, numbers, colon, dot, underscore, slash or hyphen).

Create defaults are `ACTION`, `NOT_STARTED`, `MEDIUM`, `THIS_WEEK`, no recurrence, no deadlines and no time placement. Optional create/patch fields are `projectId` (same owned Area only), `type`, `estimatedDuration`, `priority`, `whenBucket`, `dueDate`, `followUpDate`, `waitingOn`, `note`, `source`, and `isBlocked`. Status creation is limited to Not Started/In Progress/Waiting. Dates require ISO date-time with offset; omit them unless real. `null` explicitly clears nullable fields; omission preserves them on patch. Unknown fields, ownership changes, Area moves, recurrence changes, scheduling changes and arbitrary extensions are rejected.

References require a title and HTTP(S) URL; provider is `gmail`, `outlook`, or `other`. Their URLs are stored, never fetched by this connector. Reference appends preserve owner-edited references; an existing task/provider/URL match is kept unchanged. The existing UI calls these cards Email References but provider `other` supports ordinary source links.

Patch requires `expectedUpdatedAt` from a current read, `reviewed: true`, and a `patch` object. At least one actual field or reference must be supplied. Only submitted fields change. A 409 `VERSION_CONFLICT` means read/reconcile before another update; do not automatically replace the version and replay a stale patch. Ambiguous outcomes require readback before retry. A successful response includes the committed task and its new version; a separate read verifies the final state. No server/database diagnostics or credential values are returned.

`DONE` completion records `completedAt` and creates the next occurrence with the same recurrence calculation as the existing UI, inside the connector transaction. Replay with a stale version creates no extra occurrence. `DONE`/`DROPPED` tasks cannot reopen through this connector; their notes may be amended with a current version. Explicit owner UI reopening remains available. Retry creates preserve current titles, notes, scheduling, unrelated fields and terminal state.

## Reconciliation and reviewed provenance

1. Resolve owned Area/Project IDs from the catalog; never guess or create replacement Areas/Projects.
2. Search for the stable source key, then search title/intent for a matching manually created action, including closed work.
3. If a matching UI task exists without a key, read it and patch with top-level `sourceKey`, current version and a brief `patch.source` caption. Binding is optional, one-time and immutable. A uniqueness conflict means reconcile, not create another task.
4. If no matching action exists, create with the stable key. A retry with that key returns live owner edits without applying the submitted body. Keys are unique per owner across Areas, so moving a task in the UI cannot silently duplicate it on retry. Out-of-scope records are not revealed.
5. Read the committed task; return an absolute user-openable link by joining the approved origin with `taskPath`. Report saved only after readback confirms the intended fields.

For future daily handwritten notes, screenshots and quick updates, Cyrus can extract proposed actions, decisions and follow-ups in conversation. Resolve unclear handwriting, actor, Area and next action before asserting `reviewed: true`. Use a durable source key such as `cyrus:notes:2026-10-03:page-2:action-1`, independent of later title edits, plus a provenance caption and existing approved source link if available. Repeated interpretation of the same note uses the same key. A note's decision is context; do not turn every sentence into a new task. This connector does not do OCR, upload images, schedule reminders or automatically process sensitive records. `reviewed` is the caller's required assertion; the source key/caption preserve provenance, not an independent human review audit trail.

Operational responsibility is separate from authentication ownership: tasks remain owned by Ryan's existing user. This schema has no dedicated Ryan/Cyrus assignee field. When relevant, use a short `Responsible: Ryan` or `Responsible: Cyrus` line in separate details; do not misuse `recipient`, whose existing meaning concerns a delivered build. Initial supplier sends/purchases stay Ryan's actions; read-only AP verification is Cyrus's action. The connector stores that intent only and does not execute outreach or trades.

## Smallest activation steps — require separate setup/deploy/access approval

1. Review the bounded diff and tests. Confirm the canonical RyanOS host and database provider. The handoff lists `https://daily-action-os.vercel.app`; its deployed revision was not verified here.
2. Apply only the provenance-column/unique-index migration through the existing deployment process after backup/review. SQLite migration: `prisma/migrations/20261003000000_task_connector_source_key/migration.sql`. PostgreSQL SQL: `prisma/postgres-migrations/20261003000000_task_connector_source_key.sql`. The project's deploy/bootstrap scripts currently use schema push and seed; review that existing production behavior before choosing the migration route. Do not point the connector at a second/local DB expecting hosted changes.
3. Deploy the reviewed code using the existing host with bearer access disabled. In Ryan's existing authenticated session, read `/api/auth/session` for the owner ID and `/api/task-connector/catalog` for real owned Area/Project IDs. Do not share the session cookie or read account secrets.
4. Approve a precise Area allowlist, operation subset and expiry. Configure the task-only digest and local token privately through existing host/local environment controls. Start with read-only access for verification; enabling create/update is an explicit later setup decision.
5. Register the stdio adapter in the parent-accessible local environment, refresh tools, and call catalog/list/read successfully. Verify out-of-scope IDs fail. Local MCP config alone does not enable a hosted parent; use the configured local delegate if needed.
6. After separate authorization for real task writes, reconcile the three Rykas supplier actions and current AP recovery action, create/update only missing intended work, and verify saved titles, notes/statuses and links by readback. No arbitrary due dates or reminders.

No configuration, credential or deployment step above was performed in this work.

## Verification

`tests/task-connector.test.ts` uses a new temporary SQLite file and invented operational records, with an explicit datasource override. It covers missing/bad/expired auth, bearer/cookie separation, session origin protection, owner/Area/Project isolation, concurrent/sequential duplicate creates, user-edit and unrelated-field preservation, stale updates, source-key adoption, status/recurrence behavior, input/body bounds, cache/error handling, and a real stdio MCP child calling loopback authenticated HTTP backed by the synthetic Prisma database. `tests/task-connector-mcp.test.ts` tests protocol startup/tool discovery, mapping, unknown tools, endpoint/redirect handling, and secret suppression. No fixture comes from existing user task, patient, employee or account records.

Run from `command_center` with an explicitly synthetic `DATABASE_URL`: `npm test`; validate both Prisma schemas with synthetic URLs; generate the appropriate local client; `npm run build`. These checks do not apply migrations to production. Check evidence is recorded in the implementation report returned with this change.

Protocol references: [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle), [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). The adapter implements the task-tool subset, negotiates 2024-11-05/2025-03-26/2025-06-18, and has no remote HTTP MCP listener or OAuth server.
