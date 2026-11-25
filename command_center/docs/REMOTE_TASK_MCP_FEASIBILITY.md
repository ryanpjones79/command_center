# Remote RyanOS task MCP: bounded feasibility and design

2026-10-03. **Historical design snapshot:** this document records the bounded pass before Ryan subsequently authorized proceeding with local implementation. The same-app remote MCP/OAuth code is now implemented and locally tested; see [implementation and exact activation steps](REMOTE_TASK_MCP_ACTIVATION.md). The parent verified the existing Vercel login and Ryan confirmed Railway/Vercel hosting. Direct cloud access is not deployed or activated. The Tasks UI proposal is parked. References below to unimplemented routes or an unverified public login describe the earlier design state.

## 1. Pro capability remains an account-specific gate

The official pages fetched today disagree:

- The [developer-mode guide](https://developers.openai.com/api/docs/guides/developer-mode) describes read/write MCP tools and includes Pro in eligibility.
- The [Help Center FAQ](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) says Pro supports read/fetch while full MCP is currently for Business and Enterprise/Edu.

These sources do not establish this account's actual write capability. Do not prescribe an upgrade or promise Pro write access from this evidence. This delegated runtime has no supported browser/computer controller available, so Ryan's actual account UI was not inspected.

Smallest capability handback: in the cloud parent's actual account, inspect whether private remote developer apps/plugins can be added, whether OAuth is an available authentication choice, and whether write tools can be enabled. Report the visible options or provide a screenshot with personal details omitted. Inspection needs no credential generation, production access, or task data. UI availability is preliminary evidence; an authenticated write-tool discovery and call in the actual parent environment is the final capability check after the approved implementation exists. Connecting it elsewhere does not establish parent access.

## 2. App and deployment evidence

Reviewed repository files, not private environment values or database records:

- `auth.ts`: NextAuth credentials provider with JWT sessions. It verifies a password for human login; it does not implement an OAuth authorization server.
- `server/task-connector-auth.ts`: session access and disabled-by-default, expiring, owner/Area/operation-scoped local bearer access. These are not an OAuth connection flow.
- `package.json`: Next.js 15, Prisma 6.4.1, Zod 3 already present. No MCP SDK dependency presently installed.
- `vercel.json`: Next.js with `npm run vercel:build`; that script invokes database push and seed before build. Netlify's build and the named Railway predeploy script also invoke that bootstrap. Railway's checked-in build configuration itself only specifies `npm run build`; active platform settings are unverified.
- `next.config.js`: no remote MCP transport or OAuth configuration.

The handoff's candidate `https://daily-action-os.vercel.app` is not verified as the canonical active production host. Confirm host, database provider, Node runtime, deployment command, and plan limits with the owner. Review the existing bootstrap behavior before deploying any schema change. No secret file was read, host/database changed, or migration applied.

## 3. Smallest transport slice

Proposed URL: `https://<confirmed-RyanOS-host>/api/mcp/tasks`.

| Component | Proposed implementation |
| --- | --- |
| Route | `app/api/mcp/tasks/route.ts`, Node runtime, dynamic/no-store |
| Transport | Stateless Streamable HTTP, short JSON responses to POST; GET returns 405 when no SSE stream is offered |
| Tools | Existing catalog, list, read, create, update; one shared input/output contract |
| Service | Existing `server/task-connector-service.ts` and task models directly |
| Authorization | OAuth token resolves to existing `TaskAccess`; owner/Area/operation checks stay in the service |
| Dependency | `@modelcontextprotocol/sdk`, version pinned after checking current Next/Node/Zod compatibility; reuse existing Zod if supported |

Use a request-scoped SDK server/transport and close it after the response. Avoid in-memory session state across instances. Existing REST body limits need an MCP-aware limit because the protocol envelope adds bytes. Validate protocol headers, method/content type, request size, and supplied Origin using a reviewed allowlist; absent Origin is normal for server clients and does not bypass token validation. Never enable wildcard browser CORS. Return safe errors and absolute canonical task links.

This is a design inference from the app's request model. SDK Web Request/Response support must be checked before choosing its exact transport API. Prefer its native Web transport when compatible; a small bridge is a bounded fallback. The [official server guide](https://developers.openai.com/plugins/build/mcp-server) identifies the TypeScript SDK and Streamable HTTP deployment pattern. No transport code or dependency changes were made in this pass.

## 4. Authentication decision

The [official authentication guide](https://developers.openai.com/plugins/build/auth) requires authorization-code OAuth with PKCE S256, discovery metadata, resource binding, and token validation. It supports CIMD or predefined clients and explicitly excludes custom API keys and machine-to-machine grants. It recommends an established identity provider. Therefore the local bearer token cannot simply be pasted into the ChatGPT connection.

**Lowest effort if already available:** reuse an owner-approved existing OAuth issuer meeting those requirements. None was identified in the reviewed app. No external provider/account will be created during preparation.

**Same-app candidate if no issuer exists:** a narrow, owner-only authorization extension, reusing the current RyanOS session solely for sign-in and consent. This requires an authentication build and security review, not just the transport route. Proposed route names, all currently absent:

| Proposed path | Responsibility |
| --- | --- |
| `/.well-known/oauth-protected-resource/api/mcp/tasks` | MCP resource discovery |
| `/.well-known/oauth-authorization-server` | Metadata for canonical root issuer |
| `/api/mcp/oauth/authorize` | Validate request; route authenticated owner to consent; return code |
| `/api/mcp/oauth/token` | Atomic one-use code redemption and PKCE verification |
| `/api/mcp/oauth/revoke` | Standards-conforming token revocation, authenticated as appropriate |
| `/task-access` | Owner consent, connection summary and revocation control |

Recommended initial boundary: one approved ChatGPT client, explicit read/create/update permissions and owned Areas, finite access, owner revocation, no refresh/offline token feature initially. Expired access requires reauthorization. The product UI remains unchanged apart from the access consent/control required by integration.

Prefer the exact OpenAI CIMD document shown in this connection's management UI, public-client `none` exchange plus PKCE, and exact documented redirects. Restrict metadata fetch to that explicitly approved URL; reject arbitrary URLs and redirects. This avoids a generic client registry and open metadata fetcher. If the actual connection instead supports an approved predefined public client, use that reviewed alternative. Copy values from its UI; do not guess them. Official [authentication details](https://developers.openai.com/plugins/build/auth) support the public-client flow without a stored client secret.

Design-specific records in the existing database: `TaskOAuthGrant` (owner, client, approved Areas/operations, expiry/revocation), `TaskOAuthCode` (hashed code, PKCE challenge, bound client/redirect/resource, expiry/use), and `TaskOAuthAccessToken` (hashed opaque token, grant, issuer/resource, expiry/revocation). Keep SQLite/Postgres schemas aligned. This adds access records while `ExecutionTask` remains the sole task store. Opaque token verification uses its stored binding; JWT signing/JWKS infrastructure is unnecessary for this candidate.

Consent uses the authenticated owner's session, CSRF protection and a server-validated pending request. Never trust owner ID, Areas, or expanded scopes from the client. Atomically consume codes, fail closed on revoked/expired grants, rate-limit endpoints, and exclude tokens/codes/task bodies from logs. Existing task validation, provenance dedupe, immutable source adoption, optimistic concurrency, and closed-task rules remain authoritative. A tool's `reviewed:true` flag is input, not proof of owner authorization; scopes and bounded conversational authorization are both required.

## 5. Estimated implementation scope

Planning estimates, not a delivery promise:

| Slice | Estimated work after capability/host confirmation |
| --- | --- |
| MCP transport plus shared tool registration and synthetic protocol tests | 0.5-1 developer day; roughly 3-5 files |
| Existing approved issuer integration, if one is supplied | Additional 0.5-1.5 days, depending on its resource/client support |
| Same-app owner-only auth candidate | Additional 2-4 days; roughly 8-12 application files plus schema/migration/test files |
| Independent auth review and staging/cloud verification | Additional review/verification time, roughly 1-2 days |

The same-app path is approximately 3.5-7 developer days including review/verification, subject to hosting and client compatibility. Expanding to general clients, refresh tokens, other users or organizational SSO would increase scope and needs a separate design. Do not build those features speculatively.

## 6. Owner steps and readiness evidence

1. Inspect the actual parent account's private remote MCP/OAuth/write capability. If write tools are unavailable, this path cannot yet meet the goal; stop before provisioning access. No upgrade recommendation follows from the conflicting docs.
2. Confirm canonical RyanOS host/database and whether an approved existing issuer exists. With none, review and select the bounded same-app auth candidate.
3. Approve that code scope. Implement on the existing app with synthetic tests for protocol behavior, code replay/PKCE, redirects, resource/client binding, expiry/revocation, read-only grants, owner/Area isolation and existing task retry/version rules. Require independent authentication review.
4. Separately approve migration/deployment and necessary production security configuration. Review database push/seed behavior and apply controlled, reviewed migrations. Provision no credentials or durable grants before this approval.
5. Add the remote URL in the actual parent account. Ryan completes the sign-in/consent handback with read-only Area access first. Verify tool discovery and catalog/list/read from the parent's callable tools, plus scope denials.
6. After explicit write consent and authorization for a bounded real task, create/read/update/read back through the parent and return its task link. Direct integration is ready only when that evidence exists.

The [official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) describes connecting a remote server and reviewing/selecting its tools. Local Codex registration does not fulfill this parent-side step.

Outcome of this pass: concrete proposed routes, dependency, auth alternatives, owner steps and scope. Blockers remain actual parent write capability, canonical deployment details, and selection/approval of an OAuth issuer design. No real task writes, production credentials/grants, deployment or schema activation occurred. Prior local verification remains 266 passing tests and a successful production build; that evidence covers the task service/PC adapter, not these proposed remote components.
