import type { PrismaClient } from "@prisma/client";
import { signalCareApprovedOfferSchema } from "@/lib/signalcare-commercial-profile";
import {
  evaluateSignalCareProspectQuality,
  signalCareProspectQualityInputSchema
} from "@/lib/signalcare-prospect-quality";
import { prisma } from "@/lib/prisma";

export const signalCareOutreachDecisionChoices = [
  "APPROVE",
  "NEEDS_MORE_RESEARCH",
  "PASS"
] as const;

export type SignalCareDecisionTarget = {
  type: "SIGNALCARE_PROSPECT";
  name: string;
};

function normalizedName(value: string) {
  return value.trim().toLowerCase();
}

function parseRecord(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseSignalCareDecisionTarget(
  boundedPayload: string | null | undefined
): SignalCareDecisionTarget | null {
  const payload = parseRecord(boundedPayload);
  const target = payload?.targetEntity;
  if (!target || typeof target !== "object") return null;
  const record = target as Record<string, unknown>;
  if (
    record.type !== "SIGNALCARE_PROSPECT" ||
    typeof record.name !== "string" ||
    !record.name.trim()
  ) {
    return null;
  }
  return { type: "SIGNALCARE_PROSPECT", name: record.name.trim() };
}

export type SignalCareOutreachReadiness = {
  ready: boolean;
  reasons: string[];
  target: SignalCareDecisionTarget;
  queueItemId: string | null;
  queueStatus: string | null;
  qualificationActionId: string | null;
  package: Record<string, unknown> | null;
};

export async function evaluateSignalCareOutreachReadiness(
  userId: string,
  projectId: string,
  target: SignalCareDecisionTarget,
  db: PrismaClient = prisma
): Promise<SignalCareOutreachReadiness> {
  const config = await db.agentProjectConfig.findFirst({
    where: { userId, projectId, profile: "SIGNALCARE_GM" }
  });
  if (!config) {
    return {
      ready: false,
      reasons: ["Project is not an owned SignalCare GM project."],
      target,
      queueItemId: null,
      queueStatus: null,
      qualificationActionId: null,
      package: null
    };
  }

  const queueItems = await db.queueItem.findMany({
    where: { userId, lane: { in: ["signalcare", "pipeline"] } }
  });
  const queueItem = queueItems.find(
    (item) => normalizedName(item.recipient) === normalizedName(target.name)
  );
  const qualificationActions = await db.pipelineAction.findMany({
    where: { userId, type: "prospect_qualification" },
    orderBy: { date: "desc" }
  });
  const action = qualificationActions.find(
    (item) =>
      item.withWhom &&
      normalizedName(item.withWhom) === normalizedName(target.name)
  );
  const qualification = parseRecord(action?.note);
  const reasons: string[] = [];
  if (!queueItem) reasons.push("Target prospect does not exist in QueueItem.");
  if (queueItem?.status !== "outreach_ready") {
    reasons.push("Target prospect is not outreach_ready.");
  }
  if (!action || !qualification) {
    reasons.push("No structured prospect_qualification evidence exists.");
  }
  if (qualification?.recommendation !== "ADVANCE") {
    reasons.push("Qualification recommendation is not ADVANCE.");
  }
  const verifiedFacts = qualification?.verifiedPublicFacts;
  const providerSources = qualification?.providerSourceUrls;
  const providerSourceSet = new Set(
    Array.isArray(providerSources)
      ? providerSources.filter((value): value is string => typeof value === "string")
      : []
  );
  const factsHaveProviderSources =
    Array.isArray(verifiedFacts) &&
    verifiedFacts.length > 0 &&
    verifiedFacts.every((value) => {
      if (!value || typeof value !== "object") return false;
      const fact = value as Record<string, unknown>;
      return (
        typeof fact.fact === "string" &&
        fact.fact.trim().length > 0 &&
        Array.isArray(fact.sourceUrls) &&
        fact.sourceUrls.length > 0 &&
        fact.sourceUrls.every(
          (url) => typeof url === "string" && providerSourceSet.has(url)
        )
      );
    });
  if (!factsHaveProviderSources) {
    reasons.push("Qualification has no verified public facts.");
  }
  const sourceUrls = qualification?.sourceUrls;
  if (
    qualification?.providerBackedPublicSources !== true ||
    !Array.isArray(sourceUrls) ||
    sourceUrls.length === 0 ||
    !Array.isArray(providerSources) ||
    providerSources.length === 0 ||
    !sourceUrls.every(
      (url) => typeof url === "string" && providerSourceSet.has(url)
    )
  ) {
    reasons.push("Provider-backed public source provenance is missing.");
  }
  if (
    typeof qualification?.likelyStakeholderRole !== "string" ||
    !qualification.likelyStakeholderRole.trim()
  ) {
    reasons.push("Likely stakeholder role is missing.");
  }
  if (!signalCareApprovedOfferSchema.safeParse(qualification?.recommendedEntryOffer).success) {
    reasons.push("Recommended entry offer is not an approved SignalCare offer.");
  }
  if (
    typeof qualification?.conversationAngle !== "string" ||
    !qualification.conversationAngle.trim()
  ) {
    reasons.push("Conversation angle is missing.");
  }
  if (
    typeof qualification?.draftOutreachLanguage !== "string" ||
    !qualification.draftOutreachLanguage.trim()
  ) {
    reasons.push("Internal draft outreach language is missing.");
  }
  if (
    !["MEDIUM", "HIGH"].includes(
      typeof qualification?.confidence === "string"
        ? qualification.confidence
        : ""
    )
  ) {
    reasons.push("Qualification confidence is not MEDIUM or HIGH.");
  }
  if (qualification?.externalOutreachPerformed !== false) {
    reasons.push("Qualification does not affirm that no outreach occurred.");
  }
  const qualityInput = signalCareProspectQualityInputSchema.safeParse(
    qualification
  );
  if (!qualityInput.success) {
    reasons.push("Prospect-quality evidence is incomplete or malformed.");
  } else {
    const quality = evaluateSignalCareProspectQuality(qualityInput.data);
    if (quality.outcome !== "ADVANCE") {
      reasons.push(
        `Prospect quality gate did not ADVANCE: ${quality.reasons.join(" ")}`
      );
    }
    if (!["MEDIUM", "HIGH"].includes(quality.confidence)) {
      reasons.push("Prospect-quality confidence is not MEDIUM or HIGH.");
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
    target: {
      type: "SIGNALCARE_PROSPECT",
      name: queueItem?.recipient ?? target.name
    },
    queueItemId: queueItem?.id ?? null,
    queueStatus: queueItem?.status ?? null,
    qualificationActionId: action?.id ?? null,
    package: qualification
  };
}
