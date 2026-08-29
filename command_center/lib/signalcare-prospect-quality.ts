import { z } from "zod";
import type { SignalCareApprovedOffer } from "@/lib/signalcare-commercial-profile";

export const signalCareCustomerTypeSchema = z.enum([
  "DIRECT_PROSPECT",
  "SUBSIDIARY_OR_BUSINESS_UNIT",
  "TECHNOLOGY_VENDOR",
  "CONSULTING_VENDOR",
  "UNKNOWN"
]);
export const signalCareBuyingAutonomySchema = z.enum([
  "VERIFIED",
  "PLAUSIBLE",
  "UNKNOWN",
  "UNLIKELY"
]);
export const signalCareEntityIdentityConfidenceSchema = z.enum([
  "HIGH",
  "MEDIUM",
  "LOW"
]);
export const signalCareOrganizationScaleSchema = z.enum([
  "SMALL_MID_MARKET",
  "LARGE_ENTERPRISE",
  "UNKNOWN"
]);
export const signalCareSourceQualitySchema = z.enum([
  "PRIMARY",
  "SECONDARY",
  "WEAK"
]);
export const signalCareSourceAssessmentSchema = z
  .object({
    sourceUrl: z.string().url().max(2000),
    quality: signalCareSourceQualitySchema
  })
  .strict();

const sourcedFactSchema = z.object({
  fact: z.string(),
  sourceUrls: z.array(z.string())
});

export const signalCareProspectQualityInputSchema = z.object({
  customerType: signalCareCustomerTypeSchema,
  parentOrganization: z.string().nullable(),
  buyingAutonomy: signalCareBuyingAutonomySchema,
  buyingAutonomyEvidence: z.array(sourcedFactSchema),
  entityIdentityConfidence: signalCareEntityIdentityConfidenceSchema,
  organizationScale: signalCareOrganizationScaleSchema,
  realisticContractingPathEvidence: z.array(sourcedFactSchema),
  verifiedPublicFacts: z.array(sourcedFactSchema),
  verifiedFitEvidence: z.array(sourcedFactSchema),
  recommendedEntryOffer: z.enum([
    "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
    "HEALTHCARE_OPERATIONAL_VISIBILITY_WORKFLOW_DIAGNOSTIC",
    "ANALYTICS_REPORTING_MODERNIZATION"
  ]),
  likelyBuyerRole: z.string(),
  buyerRoleEvidence: z.array(sourcedFactSchema),
  targetContactName: z.string().nullable(),
  targetContactRole: z.string().nullable(),
  targetContactSourceUrl: z.string().nullable(),
  conversationAngle: z.string().nullable(),
  draftOutreachLanguage: z.string().nullable(),
  evidenceAgainstPursuit: z.string(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  recommendation: z.enum(["ADVANCE", "NEED_MORE_RESEARCH", "PASS"]),
  sourceUrls: z.array(z.string()),
  sourceQuality: z.array(signalCareSourceAssessmentSchema)
});

export type SignalCareProspectQualityInput = z.infer<
  typeof signalCareProspectQualityInputSchema
>;
export type SignalCareSourcedFact = z.infer<typeof sourcedFactSchema>;

export type SignalCareProspectQuality = {
  outcome: "ADVANCE" | "NEED_MORE_RESEARCH" | "PASS";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  directFitSignals: SignalCareSourcedFact[];
};

function compactIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedDomain(value: string) {
  try {
    const withProtocol = /^https?:\/\//i.test(value)
      ? value
      : `https://${value}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isSignalCareSourceRelevantToEntity(input: {
  sourceUrl: string;
  officialDomain: string;
  canonicalOrganizationName: string;
  knownAliases: string[];
}) {
  const sourceDomain = normalizedDomain(input.sourceUrl);
  const officialDomain = normalizedDomain(input.officialDomain);
  if (
    sourceDomain === officialDomain ||
    sourceDomain.endsWith(`.${officialDomain}`)
  ) {
    return true;
  }
  const compactUrl = compactIdentity(input.sourceUrl);
  const ambiguousAliases = new Set(["care", "captions", "healthcare"]);
  return [input.canonicalOrganizationName, ...input.knownAliases].some(
    (name) => {
      const identity = compactIdentity(name);
      return (
        identity.length >= 6 &&
        !ambiguousAliases.has(identity) &&
        compactUrl.includes(identity)
      );
    }
  );
}

const directFitPatterns: Record<SignalCareApprovedOffer, RegExp[]> = {
  DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC: [
    /multi[- ]location|\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+) locations?\b/i,
    /central(?:ized)? scheduling|online book(?:ing)?|multi[- ]provider/i,
    /unscheduled treatment|treatment follow[- ]?up|revenue cycle|practice expansion/i
  ],
  HEALTHCARE_OPERATIONAL_VISIBILITY_WORKFLOW_DIAGNOSTIC: [
    /multi[- ]location|multiple locations|multiple providers|provider network/i,
    /referral|scheduling|patient access|centralized operations/i,
    /workflow expansion|operational reporting|access expansion/i
  ],
  ANALYTICS_REPORTING_MODERNIZATION: [
    /power bi|\bsql\b|oracle health|cerner|business intelligence/i,
    /analytics|reporting modernization|reporting initiative/i,
    /operational dashboard|command center|measure validation|metrics infrastructure|data infrastructure/i
  ]
};

export function isDirectSignalCareFitSignal(
  offer: SignalCareApprovedOffer,
  fact: string
) {
  return directFitPatterns[offer].some((pattern) => pattern.test(fact));
}

const offerPersonaPatterns: Record<SignalCareApprovedOffer, RegExp> = {
  DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC:
    /\b(owner|chief executive|ceo|chief operating|coo|chief financial|cfo|revenue cycle|operations)\b/i,
  HEALTHCARE_OPERATIONAL_VISIBILITY_WORKFLOW_DIAGNOSTIC:
    /\b(chief operating|coo|operations|patient access|access|revenue cycle|analytics)\b/i,
  ANALYTICS_REPORTING_MODERNIZATION:
    /\b(chief information|cio|chief technology|cto|chief data|chief analytics|analytics|business intelligence|\bbi\b|reporting|operations)\b/i
};

export function isSignalCareBuyerPersonaAligned(
  offer: SignalCareApprovedOffer,
  role: string
) {
  return offerPersonaPatterns[offer].test(role);
}

export function hasUnresolvedOutreachPlaceholder(value: string | null) {
  if (!value) return false;
  return (
    /\[[^\]]*(?:name|recipient|contact|first)[^\]]*\]/i.test(value) ||
    /\{\{[^}]+\}\}/.test(value) ||
    /<(?:recipient|contact|first[-_ ]?name|name)>/i.test(value)
  );
}

function qualityForUrl(
  sourceUrl: string,
  assessments: SignalCareProspectQualityInput["sourceQuality"]
) {
  return assessments.find((entry) => entry.sourceUrl === sourceUrl)?.quality;
}

function hasAcceptableSourcedFact(
  facts: SignalCareSourcedFact[],
  assessments: SignalCareProspectQualityInput["sourceQuality"]
) {
  return facts.some((fact) =>
    fact.sourceUrls.some((url) =>
      ["PRIMARY", "SECONDARY"].includes(qualityForUrl(url, assessments) ?? "")
    )
  );
}

export function evaluateSignalCareProspectQuality(
  input: SignalCareProspectQualityInput
): SignalCareProspectQuality {
  const reasons: string[] = [];
  const directFitSignals = input.verifiedFitEvidence.filter(
    (fact) =>
      fact.sourceUrls.some(
        (url) => qualityForUrl(url, input.sourceQuality) !== "WEAK"
      ) && isDirectSignalCareFitSignal(input.recommendedEntryOffer, fact.fact)
  );
  const verifiedBuyerRoleEvidence =
    Boolean(input.targetContactName && input.targetContactRole) &&
    input.buyerRoleEvidence.some((fact) => {
      const text = compactIdentity(fact.fact);
      return (
        text.includes(compactIdentity(input.targetContactName ?? "")) &&
        text.includes(compactIdentity(input.targetContactRole ?? "")) &&
        fact.sourceUrls.some((url) =>
          ["PRIMARY", "SECONDARY"].includes(
            qualityForUrl(url, input.sourceQuality) ?? ""
          )
        )
      );
    });
  const structuralPass =
    input.recommendation === "PASS" ||
    input.entityIdentityConfidence === "LOW" ||
    input.customerType === "TECHNOLOGY_VENDOR" ||
    input.customerType === "CONSULTING_VENDOR" ||
    input.buyingAutonomy === "UNLIKELY";

  if (input.entityIdentityConfidence !== "HIGH") {
    reasons.push("Entity identity is not HIGH confidence.");
  }
  if (directFitSignals.length === 0) {
    reasons.push("No strong offer-specific direct fit signal is sourced.");
  }
  if (
    !["VERIFIED", "PLAUSIBLE"].includes(input.buyingAutonomy) ||
    (input.customerType === "SUBSIDIARY_OR_BUSINESS_UNIT" &&
      input.buyingAutonomy !== "VERIFIED")
  ) {
    reasons.push("Independent buying autonomy is not credible enough.");
  }
  if (
    ["VERIFIED", "PLAUSIBLE"].includes(input.buyingAutonomy) &&
    !hasAcceptableSourcedFact(input.buyingAutonomyEvidence, input.sourceQuality)
  ) {
    reasons.push("Buying-autonomy classification lacks sourced public evidence.");
  }
  if (
    input.customerType === "SUBSIDIARY_OR_BUSINESS_UNIT" &&
    !input.parentOrganization
  ) {
    reasons.push("Subsidiary or business-unit parent organization is missing.");
  }
  if (
    input.organizationScale === "LARGE_ENTERPRISE" &&
    (input.buyingAutonomy !== "VERIFIED" ||
      !hasAcceptableSourcedFact(
        input.realisticContractingPathEvidence,
        input.sourceQuality
      ))
  ) {
    reasons.push(
      "Large-enterprise prospect lacks a verified realistic contracting path."
    );
  }
  if (!input.targetContactName?.trim()) {
    reasons.push("A named public professional contact is missing.");
  }
  if (!input.targetContactRole?.trim()) {
    reasons.push("The target contact role is missing.");
  } else if (
    !isSignalCareBuyerPersonaAligned(
      input.recommendedEntryOffer,
      input.targetContactRole
    )
  ) {
    reasons.push("The target contact role is not aligned to the approved offer.");
  }
  if (
    !input.targetContactSourceUrl ||
    !input.sourceUrls.includes(input.targetContactSourceUrl) ||
    qualityForUrl(input.targetContactSourceUrl, input.sourceQuality) === "WEAK"
  ) {
    reasons.push("The named professional contact lacks acceptable public provenance.");
  }
  if (!verifiedBuyerRoleEvidence) {
    reasons.push("Buyer-role evidence is missing.");
  }
  if (!input.conversationAngle?.trim()) {
    reasons.push("A specific evidence-tied conversation angle is missing.");
  }
  if (!input.draftOutreachLanguage?.trim()) {
    reasons.push("The internal outreach draft is missing.");
  } else if (hasUnresolvedOutreachPlaceholder(input.draftOutreachLanguage)) {
    reasons.push("The internal outreach draft contains an unresolved placeholder.");
  }
  if (input.confidence === "LOW") {
    reasons.push("Model confidence is LOW.");
  }

  const distinctFactSources = new Set(
    [...input.verifiedPublicFacts, ...input.verifiedFitEvidence].flatMap(
      (fact) => fact.sourceUrls
    )
  );
  const highConfidence =
    input.entityIdentityConfidence === "HIGH" &&
    directFitSignals.length > 0 &&
    input.buyingAutonomy === "VERIFIED" &&
    hasAcceptableSourcedFact(input.buyingAutonomyEvidence, input.sourceQuality) &&
    (input.organizationScale !== "LARGE_ENTERPRISE" ||
      hasAcceptableSourcedFact(
        input.realisticContractingPathEvidence,
        input.sourceQuality
      )) &&
    Boolean(input.targetContactName?.trim()) &&
    Boolean(input.targetContactRole?.trim()) &&
    verifiedBuyerRoleEvidence &&
    input.verifiedPublicFacts.length >= 2 &&
    distinctFactSources.size >= 2 &&
    !/unresolved|contradiction|unclear buying authority|no independent buying|integrated into|acquired by|speculative partnership/i.test(
      input.evidenceAgainstPursuit
    );
  const calibratedConfidence: SignalCareProspectQuality["confidence"] =
    structuralPass || input.confidence === "LOW"
      ? "LOW"
      : input.confidence === "HIGH" && highConfidence
        ? "HIGH"
        : "MEDIUM";

  return {
    outcome: structuralPass
      ? "PASS"
      : input.recommendation === "ADVANCE" && reasons.length === 0
        ? "ADVANCE"
        : "NEED_MORE_RESEARCH",
    confidence: calibratedConfidence,
    reasons,
    directFitSignals
  };
}
