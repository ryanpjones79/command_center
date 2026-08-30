# Rykas Capital Steward V1

## Boundary

Capital Steward V1 is an additive Rykas specialist beneath the existing `RYKAS_GM` project. RyanOS remains the control plane; `ExecutionProject` and `ExecutionTask` remain the human project/task layer. Financial reads and owner-data refreshes run as subordinate `AgentWorkItem` and `AgentRun` records linked to that project and owner.

The feature cannot place orders, move money, pay debt, create a financial commitment, deploy, or merge code. Owner financial updates are data maintenance and never create an `AgentActionRequest`.

## Authoritative truth and audit findings

The implementation audited the existing Rykas SQL layer and these reference artifacts without modifying them:

- `Rykas_Simple_Operating_Model.xlsx`
- `Rykas_Operating_Model_v4.xlsx`
- `outputs/profit_cash_command_center/Rykas_Command_Center_CURRENT.xlsx`
- `outputs/owner_command_center_20260821/Rykas_Command_Center_Owner_Health.xlsx`
- `Rykas_CFO_Operating_System.md`
- existing settlement, inventory, purchase-order, obligation, and sourcing marts

The July 4 operating model used a $10,000 cash floor and a 40% debt-funded ROI threshold. Later/current artifacts and the SQL `manual.operating_assumption` records use a $20,000 planning reserve concept, 25% ROI, 10% margin, and a 60-day maximum sell-through; SQL records that Ryan confirmed the ROI and margin gates on 2026-07-16. The conflict is retained as an audit finding. The feature does not guess a reserve value or silently copy a workbook policy: the live reserve remains `MISSING` until Ryan confirms it through Agent HQ.

Spreadsheets are historical/reference material only. Live truth comes from Rykas SQL plus the bounded Rykas-native owner-maintained tables.

## Deterministic outputs

Rykas exposes bounded loopback endpoints for:

- `GET /api/sourcing/finance/snapshot`
- `GET /api/sourcing/finance/capital-plan`
- `GET /api/sourcing/inventory/replenishment-candidates`
- `GET /api/sourcing/inventory/capital-release-candidates`
- `POST /api/sourcing/sale-event/evaluate`
- `POST /api/sourcing/finance/owner-inputs`

The Amazon forecast returns available balance, pending balance, estimated payouts at 7/14/30 days, next expected payout, reserve/hold, confidence, as-of time, and missing inputs. It uses only explicit current balances and confirmed scheduled payouts. It never asks an LLM to extrapolate payouts from historical sales or settlements. Unsupported figures are `null` with `UNKNOWN` confidence and named missing inputs.

The capital plan keeps settled cash separate from forecast cash. When all required inputs are current, the deterministic waterfall subtracts open purchase orders, obligations due within 30 days, debt minimums, protected operating reserve, and core replenishment reserve before applying the owner-configured debt and discretionary-inventory policy. Any required `MISSING`, `STALE`, or `CONFLICTING` input blocks the plan and returns `safeBuyingCapacity: null`.

## Owner truth update

Agent HQ presents one **RYKAS FINANCIAL TRUTH UPDATE** instead of serial questions. The bounded form can maintain:

- current business cash;
- current debt rows or a certified current-none state;
- unrecorded obligations or a certified current-none state;
- owner reserve, debt, concentration, and inventory policy;
- current purchase-order certification.

`SAVE & RECHECK` writes only those facts to the Rykas manual layer and queues a fresh financial snapshot. `NOT AVAILABLE` and `NEEDS RECONCILIATION` remain available. Account numbers, routing numbers, credentials, payment data, and arbitrary payload fields are rejected by strict schemas.

## Freshness and activation

Defaults are configurable in Rykas SQL assumptions: cash and obligations 7 days, debt 30 days, Amazon forecast truth 2 days, and owner policy current until changed. Source-specific sales, inventory, settlement, and PO freshness remains authoritative.

Both runner flags default off:

```text
FEATURE_RYKAS_TRUTH_READ=false
FEATURE_RYKAS_OWNER_DATA_WRITE=false
```

Enable them only after applying `SQL Code/command_center/14_capital_steward_v1.sql`, restarting the loopback Rykas API, checking its health, and running the command-center and runner test/build suites. The owner-data capability remains fixed to the registered `rykas-repo` workspace and the loopback API.
