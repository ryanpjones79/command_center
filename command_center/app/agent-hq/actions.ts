"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { RYKAS_OWNER_DATA_CAPABILITY } from "@/lib/rykas-owner-financial-contract";
import { safeRykasOwnerUpdateError, type RykasOwnerUpdateStatus } from "@/lib/rykas-financial-draft";
import { resolveOwnerDecision, retryRykasOwnerFinancialUpdate, setAgentProjectPaused, submitRykasOwnerFinancialUpdate } from "@/server/agent/work-service";

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

async function queueRykasFinancialTruth(formData: FormData) {
  const user = await requireUser();
  const decisionId = entityIdSchema.parse(formData.get("decisionId"));
  const cash = optionalNumber(formData, "businessCash");
  const reserve = optionalNumber(formData, "minimumOperatingReserve");
  const discretionaryPct = optionalNumber(formData, "maximumDiscretionaryInventoryPercent");
  const rawNumber = (value: FormDataEntryValue | undefined, label: string) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric.`);
    return parsed;
  };
  const debtValues = (name: string) => formData.getAll(name);
  const debtNames = debtValues("debtDisplayName");
  const debts = debtNames.map((entry, index) => {
    const pricingType = String(debtValues("debtPricingType")[index] ?? "UNKNOWN").trim() || "UNKNOWN";
    const aprPercent = rawNumber(debtValues("debtAprPercent")[index], "Debt APR");
    return {
      displayName: String(entry).trim(), debtType: String(debtValues("debtType")[index] ?? "OTHER").trim() || "OTHER",
      pricingType, currentBalance: rawNumber(debtValues("debtBalance")[index], "Debt balance"),
      apr: pricingType === "APR" && aprPercent !== null ? aprPercent / 100 : null,
      minimumPayment: rawNumber(debtValues("debtMinimumPayment")[index], "Debt minimum payment"),
      nextDueDate: String(debtValues("debtNextDueDate")[index] ?? "").trim() || null,
      promotionalRateEnd: String(debtValues("debtPromotionalEnd")[index] ?? "").trim() || null,
      ownerPriority: rawNumber(debtValues("debtOwnerPriority")[index], "Debt owner priority"),
      remainingFinancingFee: rawNumber(debtValues("debtRemainingFee")[index], "Remaining financing fee"),
      remainingTotalRepayment: rawNumber(debtValues("debtRemainingRepayment")[index], "Remaining total repayment"),
      paymentCadence: String(debtValues("debtPaymentCadence")[index] ?? "").trim() || null,
      requiredPeriodicPayment: rawNumber(debtValues("debtRequiredPeriodicPayment")[index], "Required periodic payment"),
      notes: String(debtValues("debtNotes")[index] ?? "").trim() || null
    };
  }).filter((row) => row.displayName || row.currentBalance !== null);
  const obligationValues = (name: string) => formData.getAll(name);
  const obligationDescriptions = obligationValues("obligationDescription");
  const obligations = obligationDescriptions.map((entry, index) => ({
    vendor: String(obligationValues("obligationVendor")[index] ?? "").trim() || null,
    description: String(entry).trim(), amountDue: rawNumber(obligationValues("obligationAmount")[index], "Obligation amount"),
    dueDate: String(obligationValues("obligationDueDate")[index] ?? "").trim(),
    category: String(obligationValues("obligationCategory")[index] ?? "UNRECORDED_OBLIGATION").trim() || "UNRECORDED_OBLIGATION",
    relatedPurchaseOrderId: rawNumber(obligationValues("obligationRelatedPo")[index], "Related PO")
  })).filter((row) => row.description || row.amountDue !== null);
  const debtStatusOverride = String(formData.get("debtStatusOverride") ?? "").trim();
  const obligationStatusOverride = String(formData.get("obligationStatusOverride") ?? "").trim();
  const debtStatus = formData.get("noActiveDebt") ? "CURRENT_NONE" : debtStatusOverride || (debts.length ? "CURRENT_ROWS_LOADED" : null);
  const obligationStatus = formData.get("noUnrecordedObligations") ? "CURRENT_NONE" : obligationStatusOverride || (obligations.length ? "CURRENT_ROWS_LOADED" : null);
  const commitmentTotal = optionalNumber(formData, "ownerCertifiedOpenCommitments");
  const localCost = optionalNumber(formData, "localInventoryCostBasis");
  const observedAt = new Date().toISOString();
  const payload = {
    version: 1 as const,
    observedAt,
    businessCash: cash === null ? null : { label: "Rykas operating cash", amount: cash },
    debts: debtStatus ? { status: debtStatus, items: debtStatus === "CURRENT_ROWS_LOADED" ? debts : [], note: null } : null,
    obligations: obligationStatus ? { status: obligationStatus, items: obligationStatus === "CURRENT_ROWS_LOADED" ? obligations : [], note: null } : null,
    ownerCertifiedOpenCommitments: commitmentTotal === null ? null : { totalOpenCommitments: commitmentTotal, note: String(formData.get("openCommitmentsNote") ?? "").trim() || null },
    localInventorySnapshots: localCost === null ? (String(formData.get("localInventoryStatus") ?? "").trim() ? { status: String(formData.get("localInventoryStatus")), items: [], note: null } : null) : { status: "CURRENT_ROWS_LOADED", items: [{ location: String(formData.get("localInventoryLocation") ?? "GARAGE"), inventoryCostBasis: localCost, confidence: String(formData.get("localInventoryConfidence") ?? "ESTIMATED"), notes: String(formData.get("localInventoryNotes") ?? "").trim() || null }], note: null },
    ownerPolicy: reserve === null && discretionaryPct === null ? null : { minimumOperatingReserve: reserve, minimumDebtPaymentBuffer: optionalNumber(formData, "minimumDebtPaymentBuffer"), desiredMonthlyExtraDebtPayment: optionalNumber(formData, "desiredMonthlyExtraDebtPayment"), percentOfExcessCashToDebt: optionalNumber(formData, "percentOfExcessCashToDebt") === null ? null : optionalNumber(formData, "percentOfExcessCashToDebt")! / 100, maximumDiscretionaryInventoryPercent: discretionaryPct === null ? null : discretionaryPct / 100, maximumBrandConcentrationPercent: optionalNumber(formData, "maximumBrandConcentrationPercent") === null ? null : optionalNumber(formData, "maximumBrandConcentrationPercent")! / 100, coreReplenishmentPriority: "CORE_FIRST", speculativeTestBudgetCap: optionalNumber(formData, "speculativeTestBudgetCap"), debtStrategy: String(formData.get("debtStrategy") ?? "HIGHEST_APR"), notes: null },
    poCertification: String(formData.get("poCertification") ?? "").trim() || null
  };
  const queued = await submitRykasOwnerFinancialUpdate(user.id, decisionId, payload);
  revalidateAgentViews();
  return queued;
}

export type RykasFinancialTruthActionState = {
  status: "IDLE" | "QUEUED" | "ERROR";
  message: string;
  workItemId?: string;
};

export async function saveRykasFinancialTruthAction(
  _previousState: RykasFinancialTruthActionState,
  formData: FormData
): Promise<RykasFinancialTruthActionState> {
  try {
    const queued = await queueRykasFinancialTruth(formData);
    return { status: "QUEUED", message: "Saving owner financial truth in Rykas…", workItemId: queued.workItemId };
  } catch (error) {
    return { status: "ERROR", message: safeRykasOwnerUpdateError(error) };
  }
}

export async function getRykasOwnerUpdateStatusAction(decisionId: string): Promise<{ status: RykasOwnerUpdateStatus; message: string }> {
  const user = await requireUser();
  const id = entityIdSchema.parse(decisionId);
  const decision = await prisma.agentDecision.findFirst({ where: { id, userId: user.id }, include: { originatingWorkItem: true } });
  if (!decision) return { status: "NEEDS_ATTENTION", message: "The financial truth update could not be located. Your browser draft remains preserved." };
  if (decision.status === "RESOLVED" && decision.selectedChoice === "UPDATED_AND_RECHECK" && decision.originatingWorkItem?.state === "DONE") {
    return { status: "SAVED", message: "Rykas confirmed SAVED. A fresh financial read was queued." };
  }
  const work = decision.originatingWorkItem;
  if (!work || work.requiredCapability !== RYKAS_OWNER_DATA_CAPABILITY) return { status: "IDLE", message: "Ready for owner financial truth." };
  if (["FAILED", "PARKED"].includes(work.state)) {
    return { status: "NEEDS_ATTENTION", message: safeRykasOwnerUpdateError(work.blocker ?? "save failed") };
  }
  if (work.state === "RETRY") {
    return { status: "NEEDS_ATTENTION", message: "The save needs attention. Your exact submission is preserved and can be retried without re-entry." };
  }
  return { status: "PROCESSING", message: "Rykas is processing the bounded owner update. No financial action is authorized." };
}

export async function retryRykasOwnerFinancialUpdateAction(decisionId: string): Promise<{ status: "QUEUED" | "ERROR"; message: string }> {
  try {
    const user = await requireUser();
    await retryRykasOwnerFinancialUpdate(user.id, entityIdSchema.parse(decisionId));
    revalidateAgentViews();
    return { status: "QUEUED", message: "Retry queued with the exact preserved submission." };
  } catch (error) {
    return { status: "ERROR", message: safeRykasOwnerUpdateError(error) };
  }
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
