"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resolveOwnerDecision, setAgentProjectPaused, submitRykasOwnerFinancialUpdate } from "@/server/agent/work-service";

function revalidateAgentViews() {
  revalidatePath("/agent-hq");
  revalidatePath("/projects");
}

const entityIdSchema = z.string().min(1).max(191);

export async function setAgentProjectPausedAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({ projectId: entityIdSchema, paused: z.enum(["true", "false"]) }).safeParse({
    projectId: formData.get("projectId"),
    paused: formData.get("paused")
  });
  if (!parsed.success) {
    console.error("Invalid agent pause/resume form", parsed.error.flatten());
    return;
  }
  await setAgentProjectPaused(user.id, parsed.data.projectId, parsed.data.paused === "true");
  revalidateAgentViews();
}

export async function resolveAgentDecisionAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({ decisionId: entityIdSchema, choice: z.string().min(1).max(80) }).safeParse({
    decisionId: formData.get("decisionId"),
    choice: formData.get("choice")
  });
  if (!parsed.success) {
    console.error("Invalid agent decision form", parsed.error.flatten());
    return;
  }
  await resolveOwnerDecision(user.id, parsed.data.decisionId, parsed.data.choice);
  revalidateAgentViews();
}

function optionalNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric.`);
  return value;
}

export async function saveRykasFinancialTruthAction(formData: FormData) {
  const user = await requireUser();
  const decisionId = entityIdSchema.parse(formData.get("decisionId"));
  const cash = optionalNumber(formData, "businessCash");
  const debtBalance = optionalNumber(formData, "debtBalance");
  const debtStatus = String(formData.get("debtStatus") ?? "").trim() || null;
  const obligationAmount = optionalNumber(formData, "obligationAmount");
  const obligationStatus = String(formData.get("obligationStatus") ?? "").trim() || null;
  const reserve = optionalNumber(formData, "minimumOperatingReserve");
  const discretionaryPct = optionalNumber(formData, "maximumDiscretionaryInventoryPercent");
  const observedAt = new Date().toISOString();
  const payload = {
    version: 1 as const,
    observedAt,
    businessCash: cash === null ? null : { label: "Rykas operating cash", amount: cash },
    debts: debtStatus ? { status: debtStatus, items: debtStatus === "CURRENT_ROWS_LOADED" ? [{ displayName: String(formData.get("debtLabel") ?? "").trim(), debtType: "OTHER", currentBalance: debtBalance, apr: optionalNumber(formData, "debtAprPercent") === null ? null : optionalNumber(formData, "debtAprPercent")! / 100, minimumPayment: optionalNumber(formData, "debtMinimumPayment"), nextDueDate: String(formData.get("debtNextDueDate") ?? "").trim() || null, promotionalRateEnd: null, ownerPriority: optionalNumber(formData, "debtOwnerPriority"), notes: null }] : [], note: null } : null,
    obligations: obligationStatus ? { status: obligationStatus, items: obligationStatus === "CURRENT_ROWS_LOADED" ? [{ vendor: String(formData.get("obligationVendor") ?? "").trim() || null, description: String(formData.get("obligationDescription") ?? "").trim(), amountDue: obligationAmount, dueDate: String(formData.get("obligationDueDate") ?? "").trim(), category: "UNRECORDED_OBLIGATION", relatedPurchaseOrderId: null }] : [], note: null } : null,
    ownerPolicy: reserve === null && discretionaryPct === null ? null : { minimumOperatingReserve: reserve, minimumDebtPaymentBuffer: optionalNumber(formData, "minimumDebtPaymentBuffer"), desiredMonthlyExtraDebtPayment: optionalNumber(formData, "desiredMonthlyExtraDebtPayment"), percentOfExcessCashToDebt: optionalNumber(formData, "percentOfExcessCashToDebt") === null ? null : optionalNumber(formData, "percentOfExcessCashToDebt")! / 100, maximumDiscretionaryInventoryPercent: discretionaryPct === null ? null : discretionaryPct / 100, maximumBrandConcentrationPercent: optionalNumber(formData, "maximumBrandConcentrationPercent") === null ? null : optionalNumber(formData, "maximumBrandConcentrationPercent")! / 100, coreReplenishmentPriority: "CORE_FIRST", speculativeTestBudgetCap: optionalNumber(formData, "speculativeTestBudgetCap"), debtStrategy: String(formData.get("debtStrategy") ?? "HIGHEST_APR"), notes: null },
    poCertification: String(formData.get("poCertification") ?? "").trim() || null
  };
  await submitRykasOwnerFinancialUpdate(user.id, decisionId, payload);
  revalidateAgentViews();
}

const configSchema = z.object({
  projectId: entityIdSchema,
  operatingMode: z.enum(["SIMULATION", "LIVE_INTERNAL"]),
  objective: z.string().min(5).max(2000),
  primaryKpi: z.string().max(500).optional(),
  currentBottleneck: z.string().max(1000).optional(),
  projectManagerInstructions: z.string().min(5).max(5000),
  autonomyPolicy: z.string().min(5).max(5000),
  escalationPolicy: z.string().min(5).max(5000),
  maxConcurrentWorkItems: z.coerce.number().int().min(1).max(10),
  workspaceIdentifier: z.string().max(500).optional(),
  spendingThresholdDollars: z.coerce.number().min(0).max(10000000).optional(),
  externalActionApproval: z.string().max(2000).optional()
});

export async function updateAgentProjectConfigAction(formData: FormData) {
  const user = await requireUser();
  const parsed = configSchema.safeParse({
    projectId: formData.get("projectId"),
    operatingMode: formData.get("operatingMode"),
    objective: formData.get("objective"),
    primaryKpi: formData.get("primaryKpi") || undefined,
    currentBottleneck: formData.get("currentBottleneck") || undefined,
    projectManagerInstructions: formData.get("projectManagerInstructions"),
    autonomyPolicy: formData.get("autonomyPolicy"),
    escalationPolicy: formData.get("escalationPolicy"),
    maxConcurrentWorkItems: formData.get("maxConcurrentWorkItems"),
    workspaceIdentifier: formData.get("workspaceIdentifier") || undefined,
    spendingThresholdDollars: formData.get("spendingThresholdDollars") || undefined,
    externalActionApproval: formData.get("externalActionApproval") || undefined
  });
  if (!parsed.success) {
    console.error("Invalid agent control form", parsed.error.flatten());
    throw new Error("Agent control form validation failed. Check the server log for the invalid field.");
  }
  const config = await prisma.agentProjectConfig.findFirst({
    where: { projectId: parsed.data.projectId, userId: user.id }
  });
  if (!config) throw new Error("AgentProjectConfig not found for this user.");
  await prisma.agentProjectConfig.update({
    where: { id: config.id },
    data: {
      objective: parsed.data.objective,
      operatingMode: parsed.data.operatingMode,
      primaryKpi: parsed.data.primaryKpi ?? null,
      currentBottleneck: parsed.data.currentBottleneck ?? null,
      projectManagerInstructions: parsed.data.projectManagerInstructions,
      autonomyPolicy: parsed.data.autonomyPolicy,
      escalationPolicy: parsed.data.escalationPolicy,
      maxConcurrentWorkItems: parsed.data.maxConcurrentWorkItems,
      workspaceIdentifier: parsed.data.workspaceIdentifier ?? null,
      spendingThresholdCents:
        parsed.data.spendingThresholdDollars === undefined
          ? null
          : Math.round(parsed.data.spendingThresholdDollars * 100),
      externalActionApproval: parsed.data.externalActionApproval ?? null
    }
  });
  revalidateAgentViews();
}
