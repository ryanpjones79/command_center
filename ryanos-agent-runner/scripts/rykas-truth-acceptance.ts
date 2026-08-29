import type { RunnerConfig } from "../src/config.js";
import { RykasTruthAdapter } from "../src/rykas-adapter.js";

const config = {
  FEATURE_RYKAS_TRUTH_READ: "true",
  RYKAS_TRUTH_BASE_URL: process.env.RYKAS_TRUTH_BASE_URL ?? "http://127.0.0.1:8765",
  RYKAS_TRUTH_TIMEOUT_MS: Number(process.env.RYKAS_TRUTH_TIMEOUT_MS ?? 10000)
} as RunnerConfig;

const result = await new RykasTruthAdapter(config).execute({ version: 1, operation: "OPERATIONS_SNAPSHOT", input: { limit: 10 } });
const candidate = result.data.purchaseCandidates[0];
const research = result.data.opportunities.find((item) => ["PRICE CHECK", "SKU MAPPING NEEDED", "BUY ON PRICE", "SOURCE NEEDED", "UNGATING"].includes(item.actionState));
const blocker = result.data.blockers[0];
const review = candidate ? { outcome: "A_PURCHASE_CANDIDATE", decisionCard: { product: candidate.title, supplier: candidate.supplier, quantity: candidate.recommendedUnits, totalSpend: candidate.expectedSpend, expectedProfit: candidate.expectedProfit, expectedContribution: candidate.expectedMonthlyContribution, roi: candidate.roi, margin: candidate.margin, demand: candidate.estimatedMonthlyUnits, competition: candidate.sellerCount, freshness: candidate.freshness, risks: candidate.blockers, choices: ["BUY", "NEEDS_MORE_RESEARCH", "PASS"], purchaseAuthorized: false, purchaseExecuted: false } }
  : research ? { outcome: "B_BOUNDED_RESEARCH_OR_REFRESH", action: { opportunityId: research.opportunityId, product: research.title, actionState: research.actionState, missingEvidence: research.missingEvidence, freshness: research.freshness, purchaseExecuted: false } }
  : blocker ? { outcome: "C_OPERATIONAL_BLOCKER", blocker, purchaseExecuted: false }
  : { outcome: "D_WAIT", reason: "No current Rykas truth deserves action.", purchaseExecuted: false };
console.log(JSON.stringify({ connector: { observedAt: result.observedAt, authoritativeSource: result.authoritativeSource, freshness: result.freshness, readOnly: result.readOnly, purchaseExecuted: result.purchaseExecuted }, rykasGmReview: review }, null, 2));
