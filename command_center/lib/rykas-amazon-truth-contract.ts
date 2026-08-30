import { z } from "zod";

export const RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY = "RYKAS_AMAZON_TRUTH_REFRESH" as const;
export const rykasAmazonTruthRefreshRequestSchema = z.object({ version: z.literal(1), operation: z.literal("AMAZON_TRUTH_REFRESH") }).strict();
export const rykasAmazonTruthRefreshResultSchema = z.object({
  schemaVersion: z.literal("RYKAS_AMAZON_TRUTH_REFRESH_V1"),
  status: z.enum(["CURRENT", "PARTIAL", "FAILED"]),
  executionState: z.enum(["COMPLETED", "ALREADY_RUNNING", "COOLDOWN_ACTIVE", "BACKOFF_ACTIVE", "NEEDS_ATTENTION"]),
  failureCode: z.enum(["AMAZON_API_FAILURE", "CREDENTIAL_FAILURE", "REPORT_TIMEOUT", "NORMALIZATION_FAILURE", "SQL_LOAD_FAILURE", "FRESHNESS_STILL_STALE", "PARTIAL_OPTIONAL_REPORT_FAILURE"]).nullable(),
  message: z.string().min(1).max(4000),
  ordersThrough: z.string().max(40).nullable(), financialsThrough: z.string().max(40).nullable(), inventoryThrough: z.string().max(40).nullable(), observedAt: z.string().datetime(),
  remainingStaleAreas: z.array(z.string().max(100)).max(20), downloadedReports: z.array(z.string().max(200)).max(10), loadedSources: z.array(z.string().max(200)).max(10),
  ownerFinancialTruthChanged: z.literal(false), poCertificationChanged: z.literal(false), purchaseExecuted: z.literal(false), listingChanged: z.literal(false), priceChanged: z.literal(false), orderCreated: z.literal(false), paymentExecuted: z.literal(false),
  startedAt: z.string().datetime(), completedAt: z.string().datetime()
}).strict();
export type RykasAmazonTruthRefreshResult = z.infer<typeof rykasAmazonTruthRefreshResultSchema>;

export function serializeRykasAmazonTruthRefreshRequest() {
  return JSON.stringify(rykasAmazonTruthRefreshRequestSchema.parse({ version: 1, operation: "AMAZON_TRUTH_REFRESH" }));
}
