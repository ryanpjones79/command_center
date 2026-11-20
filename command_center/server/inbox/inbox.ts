import type { OwnerActionArea, OwnerActionCard, OwnerActionFeed } from "@/lib/owner-actions";

// Idea inbox: capture in seconds, then every idea must get a decision.
//
// Stored in the existing ParkedIdea table (no schema change):
//   status "inbox"   captured, not sorted yet  -> raises a Today card
//   status "parked"  someday; comes back for review after REVIEW_DAYS
//   status "task"    turned into a RyanOS task
//   status "note"    kept as reference, never nags
//   status "dropped" let go
// lane holds the area (RYKAS, CCHCS, ...) or "wisdom" for existing entries.

export const INBOX_STATUS = "inbox";
export const REVIEW_DAYS = 30;
export const MAX_CAPTURE_ITEMS = 200;
export const MAX_IDEA_LENGTH = 500;

export const IDEA_LANES: OwnerActionArea[] = ["RYKAS", "EBAY", "CCHCS", "AP_TRADER", "CASINO_AP", "KIDS", "HEALTH", "PERSONAL"];

// Paste from Apple Notes (or anywhere): one idea per line. Strips bullets,
// checkboxes and numbering; skips blanks, headings-only markers and repeats.
export function splitCapturedText(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine
      .replace(/^\s*(?:[-*•◦▪‣–—]|\d+[.)]|\[[ xX]?\]|☐|☑|✓|✔)\s*/u, "")
      .replace(/^\s*\[[ xX]?\]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line || /^[-=_*#\s]+$/.test(line)) continue;
    const clipped = line.length > MAX_IDEA_LENGTH ? `${line.slice(0, MAX_IDEA_LENGTH - 1).trimEnd()}…` : line;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(clipped);
    if (items.length >= MAX_CAPTURE_ITEMS) break;
  }
  return items;
}

const LANE_KEYWORDS: [OwnerActionArea, RegExp][] = [
  ["EBAY", /\bebay\b|\blisting\b|\brelist\b/i],
  ["RYKAS", /\brykas\b|\bamazon\b|\bfba\b|\basin\b|\bsupplier\b|\bwholesale\b|\bkeepa\b|\barbitrage route\b|\bstore route\b|\bsourcing\b|\breorder\b/i],
  ["CCHCS", /\bcchcs\b|\boppe\b|\bmat\b|\bdashboard\b|\bpower ?bi\b|\bsql\b|\bleadership\b|\bregistry\b/i],
  ["CASINO_AP", /\bcasino\b|\bfree ?play\b|\bslot\b|\bpromo\b|\bcomp\b|\bpoker\b/i],
  ["AP_TRADER", /\bnovig\b|\bkalshi\b|\bprophetx\b|\bpolymarket\b|\bprops?\b|\bmaker\b|\barb\b|\bbet\b|\bmodel\b|\btrader\b/i],
  ["HEALTH", /\bworkout\b|\bgym\b|\bprotein\b|\bdiet\b|\bweight\b|\bsleep\b|\bwalk\b|\bmeal\b/i],
  ["KIDS", /\bkids?\b|\bschool\b|\bson\b|\bdaughter\b|\bpractice\b|\bbirthday\b|\bfamily\b/i]
];

export function guessLane(idea: string): OwnerActionArea {
  return LANE_KEYWORDS.find(([, pattern]) => pattern.test(idea))?.[0] ?? "PERSONAL";
}

export type InboxIdea = {
  id: string;
  idea: string;
  lane: string;
  status: string;
  parkedAt: Date;
  touchedAt: Date;
};

export function isDueForReview(idea: Pick<InboxIdea, "status" | "touchedAt">, now: Date) {
  return idea.status === "parked" && now.getTime() - idea.touchedAt.getTime() >= REVIEW_DAYS * 86_400_000;
}

function daysOld(from: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

// Today feed: unsorted ideas and parked ideas due for review are to-dos.
export function buildInboxFeed(
  input: { unsorted: Pick<InboxIdea, "parkedAt">[]; dueForReview: number },
  now: Date
): OwnerActionFeed {
  const cards: OwnerActionCard[] = [];
  if (input.unsorted.length > 0) {
    const oldest = input.unsorted.reduce((min, item) => (item.parkedAt < min ? item.parkedAt : min), input.unsorted[0].parkedAt);
    const age = daysOld(oldest, now);
    const count = input.unsorted.length;
    cards.push({
      id: "inbox:sort",
      area: "INBOX",
      kind: "DECISION",
      title: `Sort ${count} captured idea${count === 1 ? "" : "s"}`,
      whyNow: age >= 1 ? `Oldest has waited ${age} day${age === 1 ? "" : "s"}. About ${Math.max(2, Math.ceil(count / 4))} min.` : "Decide each one: do, schedule, park, keep as note, or drop.",
      minutes: Math.min(30, Math.max(5, Math.ceil(count / 4))),
      dueAt: null,
      href: "/inbox",
      external: false,
      source: "Idea inbox"
    });
  }
  if (input.dueForReview > 0) {
    cards.push({
      id: "inbox:review",
      area: "INBOX",
      kind: "FOLLOW_UP",
      title: `Review ${input.dueForReview} parked idea${input.dueForReview === 1 ? "" : "s"}`,
      whyNow: `Parked ${REVIEW_DAYS}+ days ago. Act on it, keep it parked, or drop it.`,
      minutes: 5,
      dueAt: null,
      href: "/inbox?mode=review",
      external: false,
      source: "Idea inbox"
    });
  }
  return {
    area: "INBOX",
    status: cards.length ? "READY" : "EMPTY",
    message: cards.length ? null : "Inbox is empty. Every idea has a decision.",
    observedAt: null,
    cards
  };
}
