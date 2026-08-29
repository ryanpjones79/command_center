# Rykas real-truth connector architecture

Status: implementation basis recorded before connector code changes on 2026-08-29.

## Authority audit

The authoritative operational database is the local SQL Server database `rykas` on Ryan's Windows workstation. It uses Windows integrated authentication through `tools/command_center/sql_server.py`. SQL schemas have distinct responsibilities:

- `dbo` contains the existing loader-backed Amazon/Keepa and master-lookup records.
- `raw` and `staging` contain imported source records and canonical staging views.
- `manual` contains controlled owner observations such as `manual.source_offer`, `manual.landed_cost`, and `manual.purchase_order`.
- `sourcing` contains durable sourcing candidates, evaluations, evidence, source resolution, eligibility, quantity recommendations, and owner decisions.
- `mart` contains the read models consumed by the existing Rykas Sourcing Command Center.

Authoritative read surfaces for this connector are:

| Concern | Authoritative Rykas surface | Existing API projection |
| --- | --- | --- |
| Current ranked actions | `mart.sourcing_command_center_action_queue` | `GET /api/sourcing/opportunities` |
| Opportunity evidence | queue plus `sourcing.latest_candidate_evaluation`, `sourcing.candidate_eligibility_truth`, `sourcing.latest_source_resolution`, `sourcing.latest_quantity_recommendation`, `mart.mart_sku_performance`, `manual.source_offer`, `dbo.LkpMaster`, and `dbo.Keepa` | `GET /api/sourcing/opportunities/{ASIN}` |
| Purchase maturity | persisted `action_bucket`, `recommendation_status`, and `sourcing.latest_quantity_recommendation` | the two opportunity endpoints; the connector only selects persisted `BUY NOW`/`TEST` plus `BUY_RECOMMENDATION` rows |
| Buy Box | `dbo.Keepa` and `dbo.KeepaRefreshLog`; current and 30/90/180-day fields are projected without RyanOS calculation | opportunity endpoints |
| Landed/source cost | current observations in `manual.source_offer`/`manual.landed_cost`; historical reference in `dbo.LkpMaster` and PO/base metrics; provenance is classified by `sourcing.latest_source_resolution` | opportunity endpoints |
| Profit, ROI, margin, contribution | persisted Rykas evaluation/performance/quantity outputs | opportunity endpoints |
| Demand/velocity | persisted evaluation demand, Keepa demand signals, and `mart.mart_sku_performance` units/velocity | opportunity endpoints |
| Competition | persisted current seller count, offer history, and Amazon OOS measures | opportunity endpoints |
| Max/ideal cost | Rykas evaluation/assortment target outputs (`target_cost`, `max_landed_cost`, `ideal_landed_cost`) | opportunity endpoints |
| Recommended quantity/spend | `sourcing.latest_quantity_recommendation` | opportunity endpoints |
| Inventory/open PO/capital | `mart.mart_sku_performance`, `mart.owner_health_inventory_summary`, `mart.open_purchase_order_truth`, `manual.purchase_order` | item inventory in opportunity detail; bounded capital/PO summary in `GET /api/sourcing/summary` |
| Evidence/freshness | evaluation/source/eligibility/Keepa timestamps, Rykas reason codes, source `price_age_days`, and PO certification truth | summary and opportunity endpoints |
| Blockers/action state | action bucket, lifecycle/recommendation status, required action, reason codes, source/eligibility state, capital and PO truth | summary and opportunity endpoints |

Rykas owns all economic values. The connector may rename and bound fields but must not derive landed cost, profit, ROI, margin, contribution, max/ideal cost, opportunity score, or quantity. A missing value remains `null` and is reported as missing evidence.

The audited API does not expose an authoritative listing-work backlog or a complete portfolio-level inventory exception queue. Therefore this phase does not create `rykas.listing.backlog`, and it does not claim that the bounded capital/PO summary is a full inventory system. Item inventory is returned only where the existing detail endpoint provides it.

### Existing owner-maintained PO and capital surfaces

RyanOS does not store or certify Rykas cash, commitments, or buying budget. The audited owner-maintained sources are already in Rykas:

- PO rows are loaded through the controlled procurement import into `manual.purchase_order`; the current staged read is `staging.purchase_orders`.
- PO certification is recorded in `manual.po_ledger_certification` by the existing authenticated Rykas Sourcing Command Center at `/sourcing` (`POST /api/sourcing/po-certification`). `CONFIRM NO OPEN POS` is valid only when the ledger is genuinely empty. When commitments exist, the owner loads the controlled `inputs/command_center/purchase_orders.example.tsv` shape and certifies `CURRENT_OPEN_POS_LOADED` through the existing workflow.
- Owner cash inputs remain in `Rykas_Command_Center_CURRENT.xlsx`, Owner Health sheet: `Balance as of` and `Operating bank / checking balance`. The existing `tools/command_center/sync_owner_controls.py` and owner-health refresh persist those controlled inputs and calculate safe inventory capital. Safe inventory capital is not entered in RyanOS.

The typed `RYKAS_TRUTH_RECONCILIATION` NEED RYAN card therefore asks the owner to update those sources and request a read-only recheck. Its button is not certification evidence. Only a subsequent schema-valid `RYKAS_OPERATIONS_READ` result may clear the blocker.

## Connector path

Chosen path:

```text
RyanOS Agent HQ
  -> durable AgentWorkItem requiring RYKAS_OPERATIONS_READ
  -> existing outbound HMAC-authenticated Windows runner
  -> deterministic fixed loopback Rykas adapter
  -> existing 127.0.0.1 Rykas Command Center read endpoints
  -> SQL Server `rykas` authoritative marts/tables
  -> schema-validated bounded result
  -> AgentRun evidence and AgentEvent audit in RyanOS
```

This reuses the smallest existing trustworthy boundary. The Python bridge refuses non-loopback binding, accepts no caller SQL, and already fails closed when required marts or SQL connectivity are unavailable. The runner will accept only enumerated read operations, validate strict inputs and outputs with Zod, enforce limits and timeouts, and post results through the existing RyanOS HMAC/replay APIs. Railway receives no Rykas SQL credential and gets no direct or unrestricted workstation access. No inbound listener is added by RyanOS or the runner.

The existing public Cloudflare/Vercel Rykas path is not needed for the connector. The runner uses the local bridge directly; this avoids adding another cloud credential path and keeps SQL/private services on the workstation.

## Initial tool surface

The provider-neutral surface is intentionally small:

- `rykas.operations.snapshot`: backward-compatible ID, upgraded to return a real summary, bounded ranked opportunities, persisted purchase candidates, and explicit blockers when a fresh runner result exists. While disabled/unavailable it returns a safe status instead of falling back to invented economics.
- `rykas.sourcing.opportunities`: bounded predefined views (`TOP`, `OWNER_ACTION_NEEDED`, `PURCHASE_READY`, `NEEDS_DATA`, `BLOCKED`, `STALE_EVIDENCE`).
- `rykas.sourcing.opportunity_detail`: one exact deterministic `US:{ASIN}` opportunity ID.
- `rykas.purchase.candidates`: only existing Rykas `BUY NOW`/`TEST` rows with `BUY_RECOMMENDATION`; it never authorizes or executes a purchase.
- `rykas.operations.blockers`: bounded operational blockers derived from persisted Rykas states/reason codes and capital/PO truth.

Every response includes `observedAt`, `authoritativeSource`, `sourceUpdatedAt` where Rykas exposes it, and a freshness classification. Staleness is based on Rykas's persisted stale reason/status fields and certification truth, not a new RyanOS economics policy.

## Safety and activation

`RYKAS_OPERATIONS_READ` is eligible only for `RYKAS_GM`, only through the local runner, only in the registered fixed `rykas-repo` workspace, and only with the connector feature flag enabled. CCHCS and SignalCare are denied. The adapter has no POST operations, shell execution, SQL text, arbitrary URL, arbitrary path, marketplace write, cart, checkout, PO creation, or purchasing code.

Rykas remains paused after deployment. Initial activation should set the Rykas Agent HQ WIP limit to one. The deterministic `PURCHASE_INVENTORY` policy and transaction-specific owner-decision/action-request boundary remain unchanged: BUY is authorization only and there is no purchase executor in this phase.

### Exact later activation sequence

1. Leave the Rykas Agent HQ project paused while deploying. In Railway keep `FEATURE_RYKAS_TRUTH_READ=false`; no Rykas database or API credential is added to Railway. `AGENT_RYKAS_TRUTH_CACHE_MS=900000` is the bounded snapshot-cache setting.
2. On Windows, add the reviewed `rykas-repo` entry from `ryanos-agent-runner/workspaces.example.json` to the private workspace registry. The only capability is `RYKAS_OPERATIONS_READ`, the path is exactly `C:\Users\Ryan\Desktop\Rykas-codex`, and the network policy is `LOCALHOST_ONLY`.
3. Confirm `http://127.0.0.1:8765/api/sourcing/health` returns `CONNECTED`, then from `ryanos-agent-runner` run `npm test`, `npm run build`, and `npm run acceptance:rykas`.
4. Set Windows runner variables `FEATURE_RYKAS_TRUTH_READ=true`, `RYKAS_TRUTH_BASE_URL=http://127.0.0.1:8765`, and `RYKAS_TRUTH_TIMEOUT_MS=10000`. Do not enable `FEATURE_CODEX_EXECUTION` for this connector.
5. In Railway set `FEATURE_RYKAS_TRUTH_READ=true` and retain the existing runner HMAC variables. There are no Rykas SQL, Cloudflare, marketplace, or workstation credentials in Railway.
6. In Agent HQ, edit only the existing Rykas `ExecutionProject`: set workspace identifier `rykas-repo`, maximum concurrent work `1`, operating mode `LIVE_INTERNAL`, and enable/unpause the project. Do not enable CCHCS. SignalCare settings are unchanged.
7. Restart the existing Windows runner scheduled task, or stop the current runner process and run `node --env-file=.env --import tsx src/index.ts` from `ryanos-agent-runner`. No inbound port or firewall rule is needed.
8. Trigger one Agent HQ review. The first review queues the durable read and waits; after the runner posts the result, the next review consumes it. Confirm `RYKAS_TRUTH_READ` and either `RYKAS_DATA_STALE`, `RYKAS_DATA_BLOCKED`, `RYKAS_OPPORTUNITY_OBSERVED`, or `RYKAS_PURCHASE_CANDIDATE_READY` in Agent HQ.
9. Roll back immediately by setting Railway and Windows `FEATURE_RYKAS_TRUTH_READ=false`, restarting the runner, and pausing the Rykas project. Durable read evidence remains auditable; no Rykas truth or orders are deleted or changed.
