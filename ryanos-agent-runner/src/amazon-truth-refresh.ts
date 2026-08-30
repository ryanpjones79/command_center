import { realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { run } from "./process.js";

export const amazonTruthRefreshRequestSchema = z.object({
  version: z.literal(1),
  operation: z.literal("AMAZON_TRUTH_REFRESH")
}).strict();

const failureCodeSchema = z.enum([
  "AMAZON_API_FAILURE",
  "CREDENTIAL_FAILURE",
  "REPORT_TIMEOUT",
  "NORMALIZATION_FAILURE",
  "SQL_LOAD_FAILURE",
  "FRESHNESS_STILL_STALE",
  "PARTIAL_OPTIONAL_REPORT_FAILURE"
]);

export const amazonTruthRefreshResultSchema = z.object({
  schemaVersion: z.literal("RYKAS_AMAZON_TRUTH_REFRESH_V1"),
  status: z.enum(["CURRENT", "PARTIAL", "FAILED"]),
  executionState: z.enum(["COMPLETED", "ALREADY_RUNNING", "COOLDOWN_ACTIVE", "BACKOFF_ACTIVE", "NEEDS_ATTENTION"]),
  failureCode: failureCodeSchema.nullable(),
  message: z.string().min(1).max(4000),
  ordersThrough: z.string().max(40).nullable(),
  financialsThrough: z.string().max(40).nullable(),
  inventoryThrough: z.string().max(40).nullable(),
  observedAt: z.string().datetime(),
  remainingStaleAreas: z.array(z.string().max(100)).max(20),
  downloadedReports: z.array(z.string().max(200)).max(10),
  loadedSources: z.array(z.string().max(200)).max(10),
  ownerFinancialTruthChanged: z.literal(false),
  poCertificationChanged: z.literal(false),
  purchaseExecuted: z.literal(false),
  listingChanged: z.literal(false),
  priceChanged: z.literal(false),
  orderCreated: z.literal(false),
  paymentExecuted: z.literal(false),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime()
}).strict();

export type AmazonTruthRefreshResult = z.infer<typeof amazonTruthRefreshResultSchema>;

export class AmazonTruthRefreshAdapter {
  constructor(private timeoutMs: number, private executor: typeof run = run) {}

  async execute(workspacePath: string, rawRequest: unknown): Promise<AmazonTruthRefreshResult> {
    amazonTruthRefreshRequestSchema.parse(rawRequest);
    const workspace = realpathSync.native(path.resolve(workspacePath));
    const script = realpathSync.native(path.join(workspace, "tools", "command_center", "Invoke-AmazonTruthRefresh.ps1"));
    const relative = path.relative(workspace, script);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Amazon refresh script escaped the registered Rykas workspace.");
    const execution = await this.executor("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], workspace, this.timeoutMs);
    const lines = execution.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let payload: unknown = null;
    for (const line of [...lines].reverse()) {
      try { payload = JSON.parse(line); break; } catch { /* ignore non-JSON progress */ }
    }
    if (!payload) throw new Error(`Amazon refresh returned no structured result (exit ${execution.code}).`);
    return amazonTruthRefreshResultSchema.parse(payload);
  }
}
