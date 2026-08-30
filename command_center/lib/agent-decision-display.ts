import {
  parseRykasTruthReconciliation,
  RYKAS_OWNER_DATA_SOURCE_INSTRUCTIONS
} from "@/lib/rykas-owner-data-contract";
import { signalCareCommercialProfile } from "@/lib/signalcare-commercial-profile";

type DecisionDisplayInput = {
  category: string;
  context: string;
  expectedUpside: string | null;
  risk: string;
  recommendedChoice: string | null;
  amountCents: number | null;
  currency: string | null;
  originatingRunId?: string | null;
  actionRequest?: { boundedPayload: string } | null;
};

export type AgentDecisionPresentation = {
  kind: "RYKAS_TRUTH_RECONCILIATION" | "SIGNALCARE_OUTREACH" | "GENERIC";
  categoryLabel: string;
  contextSummary: string;
  recommendation: string | null;
  why: string[];
  keyFacts: Array<{ label: string; value: string }>;
  proposedAction: string | null;
  draft: string | null;
  sourceUrls: string[];
  auditPayload: unknown;
};

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readable(value: string) {
  return value.replaceAll("\\n", "\n").replace(/\r\n/g, "\n").trim();
}

function contextBeforePayload(value: string) {
  const marker = "Evidence-backed internal outreach package:";
  const [summary] = value.split(marker);
  const normalized = readable(summary ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.startsWith("{") || normalized.startsWith("[")) {
    return "Structured evidence is available in audit details.";
  }
  return normalized;
}

function embeddedSignalCarePackage(value: string) {
  const marker = "Evidence-backed internal outreach package:";
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return record(parseJson(value.slice(index + marker.length).trim()));
}

function sourceUrlsFrom(value: Record<string, unknown> | null) {
  if (!value) return [];
  const urls = [value.sourceUrls, value.providerSourceUrls]
    .flatMap((candidate) => (Array.isArray(candidate) ? candidate : []))
    .filter(
      (candidate): candidate is string =>
        typeof candidate === "string" && /^https?:\/\//.test(candidate)
    );
  return [...new Set(urls)];
}

function signalCarePresentation(
  input: DecisionDisplayInput,
  payload: Record<string, unknown>
) {
  const target = record(payload.targetEntity);
  const outreachPackage =
    record(payload.outreachPackage) ?? embeddedSignalCarePackage(input.context);
  if (!outreachPackage) return null;
  const targetName =
    stringValue(target?.name) ??
    stringValue(outreachPackage.organizationName) ??
    "Verified prospect";
  const targetRole =
    stringValue(outreachPackage.targetContactRole) ??
    stringValue(outreachPackage.likelyStakeholderRole);
  const targetContact = stringValue(outreachPackage.targetContactName);
  const offerId = stringValue(outreachPackage.recommendedEntryOffer);
  const offer = signalCareCommercialProfile.offers.find(
    (candidate) => candidate.id === offerId
  );
  const verifiedFacts = Array.isArray(outreachPackage.verifiedPublicFacts)
    ? outreachPackage.verifiedPublicFacts
        .flatMap((value) => {
          const fact = record(value);
          const text = stringValue(fact?.fact);
          return text ? [text] : [];
        })
        .slice(0, 3)
    : [];
  const confidence = stringValue(outreachPackage.confidence);
  const conversationAngle = stringValue(outreachPackage.conversationAngle);
  const draft = stringValue(outreachPackage.draftOutreachLanguage);
  const sources = sourceUrlsFrom(outreachPackage);
  return {
    kind: "SIGNALCARE_OUTREACH" as const,
    categoryLabel: "SIGNALCARE / OUTREACH",
    contextSummary: contextBeforePayload(input.context),
    recommendation: input.recommendedChoice,
    why: verifiedFacts.length
      ? verifiedFacts
      : [
          input.expectedUpside ||
            "A verified outreach package is ready for owner review."
        ],
    keyFacts: [
      { label: "Offer", value: offer?.name ?? offerId ?? "Not specified" },
      {
        label: "Target",
        value:
          [targetContact, targetRole].filter(Boolean).join(" — ") || targetName
      },
      ...(conversationAngle
        ? [{ label: "Conversation angle", value: conversationAngle }]
        : []),
      ...(confidence ? [{ label: "Confidence", value: confidence }] : []),
      {
        label: "Sources",
        value: `${sources.length} provider-backed source${sources.length === 1 ? "" : "s"}`
      }
    ],
    proposedAction: `Approve one exact first-outreach package to ${targetName}. Approval does not send it.`,
    draft: draft ? readable(draft) : null,
    sourceUrls: sources,
    auditPayload: payload
  };
}

export function buildAgentDecisionPresentation(
  input: DecisionDisplayInput
): AgentDecisionPresentation {
  const reconciliation = parseRykasTruthReconciliation(input.context);
  if (reconciliation) {
    return {
      kind: "RYKAS_TRUTH_RECONCILIATION",
      categoryLabel: "RYKAS / TRUTH RECONCILIATION",
      contextSummary: "Buying blocked — PO/capital truth needs update.",
      recommendation: input.recommendedChoice,
      why: [
        "The PO ledger is not current and verified.",
        "Safe inventory capital is unknown, so buying remains blocked."
      ],
      keyFacts: [
        {
          label: "Observed commitments",
          value:
            reconciliation.openCommitments === null
              ? "Unknown"
              : reconciliation.openCommitments.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD"
                })
        },
        { label: "PO ledger", value: reconciliation.poLedgerStatus },
        {
          label: "PO truth current",
          value: reconciliation.poTruthCurrent ? "Yes" : "No"
        },
        {
          label: "Last certified",
          value: reconciliation.poCertifiedAt
            ? new Date(reconciliation.poCertifiedAt).toLocaleString("en-US")
            : "Unknown"
        },
        {
          label: "Safe inventory capital",
          value:
            reconciliation.safeInventoryCapital === null
              ? "Unknown"
              : reconciliation.safeInventoryCapital.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD"
                })
        }
      ],
      proposedAction:
        "Update the authoritative Rykas PO/capital source, then request a recheck.",
      draft: null,
      sourceUrls: [],
      auditPayload: {
        reconciliation,
        sourceInstructions: RYKAS_OWNER_DATA_SOURCE_INSTRUCTIONS
      }
    };
  }

  const parsedPayload = record(parseJson(input.actionRequest?.boundedPayload));
  if (input.category === "SEND_EMAIL_OR_MESSAGE") {
    const signalCare = signalCarePresentation(input, parsedPayload ?? {});
    if (signalCare) return signalCare;
  }

  const contextJson = parseJson(input.context);
  const contextSummary = contextJson
    ? "Structured evidence is available in audit details."
    : contextBeforePayload(input.context);
  return {
    kind: "GENERIC",
    categoryLabel: input.category.replaceAll("_", " "),
    contextSummary,
    recommendation: input.recommendedChoice,
    why: [
      input.expectedUpside ||
        "Owner judgment is required by deterministic policy."
    ],
    keyFacts:
      input.amountCents === null
        ? []
        : [
            {
              label: "Amount / exposure",
              value: new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: input.currency ?? "USD"
              }).format(input.amountCents / 100)
            }
          ],
    proposedAction: null,
    draft: null,
    sourceUrls: [],
    auditPayload: parsedPayload ?? contextJson ?? input.context
  };
}

export function decisionPrimaryText(presentation: AgentDecisionPresentation) {
  return [
    presentation.categoryLabel,
    presentation.contextSummary,
    presentation.recommendation,
    ...presentation.why,
    ...presentation.keyFacts.flatMap((fact) => [fact.label, fact.value]),
    presentation.proposedAction,
    presentation.draft
  ]
    .filter(Boolean)
    .join("\n");
}
