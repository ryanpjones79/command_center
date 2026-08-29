"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resolveOwnerDecision, setAgentProjectPaused } from "@/server/agent/work-service";

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
