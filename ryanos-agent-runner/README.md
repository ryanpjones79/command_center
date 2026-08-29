# RyanOS local agent runner

This Windows-local Node/TypeScript process is a subordinate execution worker for the existing `command_center/` control plane. RyanOS remains the source of truth. The runner exposes no inbound listener: it polls authenticated RyanOS endpoints, claims one bounded item, works in a registered workspace, and submits operational evidence.

## Security boundary

- HMAC-SHA256 signs method, path, ISO timestamp, unique request ID, and SHA-256 body hash. RyanOS allows five minutes of clock skew and persists request IDs to reject replay.
- Secrets stay in environment files and are never stored in the RyanOS database or sent to Codex. Rotate by temporarily configuring old and new key IDs in `RYANOS_RUNNER_HMAC_KEYS`, registering the new key ID, switching the runner, then removing the old key.
- Workspace identifiers resolve through a local registry. Unknown identifiers/capabilities fail closed. `CCHCS_SENSITIVE` is always denied; only explicitly registered `CCHCS_PHI_FREE` repositories are eligible.
- Codex receives a minimal environment, explicit working directory, `workspace-write` for implementation or `read-only` for review, network disabled, no additional directories, Git-repo checking enabled, and noninteractive `approvalPolicy: never`.
- Mutable jobs require a clean canonical Git repository and run in `agent/<project>/<work-item>` worktrees. Nothing auto-merges or deploys. Successful worktrees are retained for review.
- `RYKAS_OPERATIONS_READ` is a separate deterministic path. It accepts only versioned predefined reads, requires the fixed `rykas-repo` registry entry and `LOCALHOST_ONLY`, calls only the existing Rykas loopback GET endpoints, validates bounded output, and never starts Codex or a shell.

## Windows setup

1. Install Node.js 18 or newer, Git, and Codex authentication/API access.
2. Run `npm install` in this directory.
3. Copy `.env.example` outside source control and create a workspace registry from `workspaces.example.json` using trusted absolute paths and trusted test commands.
4. In `command_center`, set the same key ID/secret and `RYANOS_RUNNER_OWNER_EMAIL`, then run `npm run agent:register-runner`.
5. Keep `FEATURE_CODEX_EXECUTION=false` until registry review, then enable it in the runner only. Set the RyanOS project to `LIVE_INTERNAL` and assign its workspace identifier.
6. Start once with `node --env-file=.env --import tsx src/index.ts --once`; run continuously with `node --env-file=.env --import tsx src/index.ts`.

For startup, use Windows Task Scheduler with “At log on”, the working directory set to this folder, restart-on-failure enabled, and the continuous command above. Redirect stdout/stderr to a user-owned logs directory or wrap it with an established Windows service manager. Stop with Ctrl+C or end the scheduled task; leases expire safely and are reclaimable. Never configure inbound firewall access.

## Controlled Rykas read activation

Keep `FEATURE_RYKAS_TRUTH_READ=false` until Ryan explicitly activates it. The reviewed local registry entry is:

```json
"rykas-repo": {
  "canonicalPath": "C:\\Users\\Ryan\\Desktop\\Rykas-codex",
  "projectSlug": "rykas",
  "capabilities": ["RYKAS_OPERATIONS_READ"],
  "networkPolicy": "LOCALHOST_ONLY",
  "sensitivity": "STANDARD",
  "testCommands": []
}
```

Before enabling Agent HQ, verify the existing Rykas bridge and adapter without changing either system:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/api/sourcing/health
npm test
npm run build
npm run acceptance:rykas
```

Then set `FEATURE_RYKAS_TRUTH_READ=true` and keep `RYKAS_TRUTH_BASE_URL=http://127.0.0.1:8765` in the runner environment. Restart the existing scheduled runner task, or stop the current process and run `node --env-file=.env --import tsx src/index.ts`. This adds no inbound listener.

## Recovery

RyanOS owns leases and attempt counts. A crash or reboot leaves work claimed only until lease expiry. Duplicate signed request IDs are rejected; duplicate successful result submissions return the stored state. A failed or abandoned worktree is never removed if it contains uncommitted changes. Operators should inspect retained branches/worktrees and remove them with normal Git worktree commands only after confirming they are no longer needed.
