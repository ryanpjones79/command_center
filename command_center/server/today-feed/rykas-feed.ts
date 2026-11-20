import type { PrismaClient } from "@prisma/client";
import {
  capOwnerActions,
  truncateText,
  type OwnerActionCard,
  type OwnerActionFeed
} from "@/lib/owner-actions";
import {
  RYKAS_READ_CAPABILITY,
  rykasTruthResultSchema,
  type RykasTruthResult
} from "@/lib/rykas-truth-contract";

// Rykas feed for Today.
//
// Read-only by design: it never queues a runner read and never calls Rykas.
// It reuses what Agent HQ already persisted:
//   1. pending owner decisions (AgentDecision) on the RYKAS_GM project, and
//   2. the newest schema-valid RYKAS_OPERATIONS_READ runner result.
// Rykas owns all economics; values are shown as persisted, never derived.

export const DEFAULT_SUPPLIER_OS_URL = "https://rykas-supplier-os.up.railway.app";
// A result older than this is shown, but flagged stale on Today.
export const RYKAS_FEED_STALE_MS = 24 * 60 * 60 * 1000;
const FEED_OPERATIONS = new Set<RykasTruthResult["operation"]>([
  "OPERATIONS_SNAPSHOT",
  "PURCHASE_CANDIDATES",
  "OPERATIONS_BLOCKERS",
  "SOURCING_OPPORTUNITIES"
]);
// Blocker stages that only the owner can clear; per-item stages are covered
// by the opportunity cards themselves.
const OWNER_BLOCKER_STAGES = new Set(["SYSTEM", "PURCHASE_DECISION"]);

export type RykasPendingDecision = {
  id: string;
  question: string;
  recommendedChoice: string | null;
  expectedUpside: string | null;
  createdAt: Date;
};

export function supplierOsBaseUrl() {
  const raw = process.env.RYKAS_SUPPLIER_OS_URL?.trim();
  return (raw && /^https:\/\//.test(raw) ? raw : DEFAULT_SUPPLIER_OS_URL).replace(/\/+$/, "");
}

function money(value: number | null) {
  return value === null
    ? null
    : value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function opportunityLabel(item: RykasTruthResult["data"]["opportunities"][number]) {
  return truncateText(item.title ?? [item.brand, item.asin].filter(Boolean).join(" "), 70);
}

export function rykasCardsFromSources(
  decisions: RykasPendingDecision[],
  truth: RykasTruthResult | null,
  baseUrl = DEFAULT_SUPPLIER_OS_URL
): OwnerActionCard[] {
  const cards: OwnerActionCard[] = decisions.map((decision) => ({
    id: `rykas:decision:${decision.id}`,
    area: "RYKAS",
    kind: "DECISION",
    title: truncateText(decision.question, 110),
    whyNow: truncateText(
      decision.recommendedChoice
        ? `Recommended: ${decision.recommendedChoice}`
        : decision.expectedUpside ?? "Agent HQ is waiting on your decision.",
      160
    ),
    minutes: 5,
    dueAt: null,
    href: "/agent-hq",
    external: false,
    source: "Agent HQ decision"
  }));

  if (!truth) return capOwnerActions(cards);

  for (const blocker of truth.data.blockers) {
    if (!OWNER_BLOCKER_STAGES.has(blocker.stage)) continue;
    cards.push({
      id: `rykas:blocker:${blocker.id}`,
      area: "RYKAS",
      kind: "FIX",
      title: truncateText(blocker.summary, 110),
      whyNow: `Blocks Rykas ${blocker.stage === "SYSTEM" ? "buying decisions" : "purchase decisions"} until cleared.`,
      minutes: 15,
      dueAt: null,
      href: `${baseUrl}/sourcing`,
      external: true,
      source: `Rykas blocker ${blocker.code}`
    });
  }

  const capital = truth.data.capital;
  if (capital && !capital.reliable && capital.actionRequired) {
    cards.push({
      id: "rykas:capital",
      area: "RYKAS",
      kind: "FIX",
      title: truncateText(capital.actionRequired, 110),
      whyNow: truncateText(capital.reason ?? "Capital truth is not reliable, so buys stay gated.", 160),
      minutes: 15,
      dueAt: null,
      href: `${baseUrl}/sourcing`,
      external: true,
      source: "Rykas capital / PO truth"
    });
  }

  for (const item of truth.data.purchaseCandidates) {
    const spend = money(item.expectedSpend);
    const profit = money(item.expectedProfit);
    cards.push({
      id: `rykas:opportunity:${item.opportunityId}`,
      area: "RYKAS",
      kind: "BUY_REVIEW",
      title: `Review buy: ${opportunityLabel(item)}`,
      whyNow: truncateText(
        [
          item.decision ?? "Rykas marks this a buy",
          item.recommendedUnits !== null ? `${item.recommendedUnits} units` : null,
          spend ? `spend ${spend}` : null,
          profit ? `expected profit ${profit}` : null
        ]
          .filter(Boolean)
          .join(" · "),
        160
      ),
      minutes: 10,
      dueAt: null,
      href: `${baseUrl}/sourcing/opportunities/${item.asin}`,
      external: true,
      source: "Rykas purchase candidate"
    });
  }

  for (const item of truth.data.opportunities) {
    if (!item.requiredAction) continue;
    cards.push({
      id: `rykas:opportunity:${item.opportunityId}`,
      area: "RYKAS",
      kind: "FOLLOW_UP",
      title: truncateText(`${item.requiredAction}: ${opportunityLabel(item)}`, 110),
      whyNow: truncateText(
        item.blockers[0] ?? (item.missingEvidence.length ? `Missing: ${item.missingEvidence.slice(0, 3).join(", ")}` : `Rykas state: ${item.actionState}`),
        160
      ),
      minutes: 10,
      dueAt: null,
      href: `${baseUrl}/sourcing/opportunities/${item.asin}`,
      external: true,
      source: "Rykas opportunity"
    });
  }

  return capOwnerActions(cards);
}

export function buildRykasFeed(input: {
  connected: boolean;
  connectorEnabled: boolean;
  decisions: RykasPendingDecision[];
  truth: RykasTruthResult | null;
  truthCompletedAt: Date | null;
  now: Date;
  baseUrl?: string;
}): OwnerActionFeed {
  if (!input.connected) {
    return {
      area: "RYKAS",
      status: "UNAVAILABLE",
      message: "No Rykas project is set up in Agent HQ yet.",
      observedAt: null,
      cards: []
    };
  }

  const cards = rykasCardsFromSources(input.decisions, input.truth, input.baseUrl);
  const observedAt = input.truth?.observedAt ?? input.truthCompletedAt?.toISOString() ?? null;
  const tooOld =
    input.truthCompletedAt !== null &&
    input.now.getTime() - input.truthCompletedAt.getTime() > RYKAS_FEED_STALE_MS;

  if (!input.truth) {
    return {
      area: "RYKAS",
      status: cards.length ? "READY" : "OFF",
      message: input.connectorEnabled
        ? "No Rykas data read yet. Agent HQ will pull it on its next review."
        : "Rykas data connector is off, so only Agent HQ decisions show here.",
      observedAt: null,
      cards
    };
  }

  if (input.truth.stale || tooOld) {
    return {
      area: "RYKAS",
      status: "STALE",
      message: tooOld
        ? "Rykas data is more than a day old. Check it before acting."
        : "Rykas marks this data stale. Check it before acting.",
      observedAt,
      cards
    };
  }

  return {
    area: "RYKAS",
    status: cards.length ? "READY" : "EMPTY",
    message: cards.length ? null : "Nothing in Rykas needs you right now.",
    observedAt,
    cards
  };
}

export async function loadRykasFeed(
  userId: string,
  db: PrismaClient,
  now = new Date()
): Promise<OwnerActionFeed> {
  try {
    const config = await db.agentProjectConfig.findFirst({
      where: { userId, profile: "RYKAS_GM" },
      select: { projectId: true }
    });
    const connectorEnabled = process.env.FEATURE_RYKAS_TRUTH_READ === "true";
    if (!config) {
      return buildRykasFeed({ connected: false, connectorEnabled, decisions: [], truth: null, truthCompletedAt: null, now });
    }

    const [decisions, runs] = await Promise.all([
      db.agentDecision.findMany({
        where: { userId, projectId: config.projectId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, question: true, recommendedChoice: true, expectedUpside: true, createdAt: true }
      }),
      db.agentRun.findMany({
        where: {
          userId,
          projectId: config.projectId,
          status: "SUCCEEDED",
          structuredOutcome: { not: null },
          workItem: { requiredCapability: RYKAS_READ_CAPABILITY }
        },
        orderBy: { completedAt: "desc" },
        take: 10,
        select: { structuredOutcome: true, completedAt: true }
      })
    ]);

    let truth: RykasTruthResult | null = null;
    let truthCompletedAt: Date | null = null;
    for (const run of runs) {
      let raw: unknown = null;
      try {
        raw = JSON.parse(run.structuredOutcome ?? "null");
      } catch {
        continue;
      }
      const parsed = rykasTruthResultSchema.safeParse(raw);
      if (parsed.success && FEED_OPERATIONS.has(parsed.data.operation)) {
        truth = parsed.data;
        truthCompletedAt = run.completedAt;
        break;
      }
    }

    return buildRykasFeed({
      connected: true,
      connectorEnabled,
      decisions,
      truth,
      truthCompletedAt,
      now,
      baseUrl: supplierOsBaseUrl()
    });
  } catch (error) {
    console.error("Rykas Today feed failed", error instanceof Error ? error.message : "unknown error");
    return {
      area: "RYKAS",
      status: "UNAVAILABLE",
      message: "Couldn't load Rykas actions. The rest of Today still works.",
      observedAt: null,
      cards: []
    };
  }
}
