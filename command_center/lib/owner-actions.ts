// Shared "owner action card" contract for the Today screen.
//
// Every life/business area (Rykas, eBay, AP Trader, Casino AP, CCHCS, Kids,
// Health, Personal) feeds Today in this one shape. A feed sends at most
// MAX_CARDS_PER_AREA actions that genuinely need Ryan; an area with nothing
// for Ryan sends no cards. Feeds are read-only: a card links to where the
// decision is made, it never performs the action itself.

export const OWNER_ACTION_AREAS = [
  "KIDS",
  "HEALTH",
  "CCHCS",
  "RYKAS",
  "EBAY",
  "AP_TRADER",
  "CASINO_AP",
  "PERSONAL"
] as const;

export type OwnerActionArea = (typeof OWNER_ACTION_AREAS)[number];

export const OWNER_ACTION_AREA_LABELS: Record<OwnerActionArea, string> = {
  KIDS: "Kids",
  HEALTH: "Health",
  CCHCS: "CCHCS",
  RYKAS: "Rykas",
  EBAY: "eBay",
  AP_TRADER: "AP Trader",
  CASINO_AP: "Casino AP",
  PERSONAL: "Personal"
};

// DECISION: an owner decision is waiting (approve / choose).
// BUY_REVIEW: the source system already marks this a buy; Ryan reviews it.
// FIX: a blocker only Ryan can clear (update a source, certify, confirm).
// FOLLOW_UP: a next step the source system assigned to Ryan.
export type OwnerActionKind = "DECISION" | "BUY_REVIEW" | "FIX" | "FOLLOW_UP";

export const MAX_CARDS_PER_AREA = 3;

export type OwnerActionCard = {
  id: string;
  area: OwnerActionArea;
  kind: OwnerActionKind;
  title: string;
  whyNow: string;
  minutes: number | null;
  dueAt: string | null;
  href: string;
  external: boolean;
  source: string;
};

export type OwnerFeedStatus = "READY" | "EMPTY" | "STALE" | "OFF" | "UNAVAILABLE";

export type OwnerActionFeed = {
  area: OwnerActionArea;
  status: OwnerFeedStatus;
  message: string | null;
  observedAt: string | null;
  cards: OwnerActionCard[];
};

const KIND_RANK: Record<OwnerActionKind, number> = {
  DECISION: 0,
  FIX: 1,
  BUY_REVIEW: 2,
  FOLLOW_UP: 3
};

// Keep source order within a kind, rank kinds, drop duplicate ids, cap.
export function capOwnerActions(
  cards: OwnerActionCard[],
  limit = MAX_CARDS_PER_AREA
): OwnerActionCard[] {
  const seen = new Set<string>();
  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    })
    .sort(
      (a, b) =>
        KIND_RANK[a.card.kind] - KIND_RANK[b.card.kind] || a.index - b.index
    )
    .slice(0, Math.max(0, limit))
    .map(({ card }) => card);
}

export function truncateText(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
