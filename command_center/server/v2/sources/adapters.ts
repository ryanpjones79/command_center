import { detectPhi } from "@/lib/execution-validation";
import type { OwnerActionCard } from "@/lib/owner-actions";
import type { SourceEvent } from "@/lib/v2/source-events";

// Adapters turn source readings into persistent-action events. Sources keep
// their analysis; adapters only translate. Absence from a successful reading is
// recovery evidence ONLY for AP incidents (the bot reports healthy state);
// for actions it means GONE (unknown), never done.

const safeId = (value: string) => value.replace(/[^A-Za-z0-9._:@\-/#]/g, "-").slice(0, 200);
const httpsOrNull = (value: string) => (value.startsWith("https://") ? value : null);

export function apCardsToEvents(cards: OwnerActionCard[], observedAt: Date): SourceEvent[] {
  return cards.map((card) => ({
    version: 1,
    system: "AP_TRADER",
    sourceId: safeId(card.id),
    kind: "INCIDENT",
    state: "OPEN",
    title: card.title.slice(0, 200),
    doneWhen: "The bot reports this condition cleared",
    url: httpsOrNull(card.href),
    durationMinutes: Math.max(5, card.minutes ?? 10),
    workContext: "ANYWHERE",
    projectKey: "ap-trader-ops",
    projectName: "AP Trader operations",
    observedAt: observedAt.toISOString()
  }));
}

// Open AP incidents not present in a SUCCESSFUL reading: the bot's own healthy
// status is the recovery evidence.
export function apRecoveredEvents(openIncidentIds: { sourceId: string; title: string }[], currentIds: Set<string>, observedAt: Date): SourceEvent[] {
  return openIncidentIds
    .filter((incident) => !currentIds.has(incident.sourceId))
    .map((incident) => ({
      version: 1,
      system: "AP_TRADER",
      sourceId: incident.sourceId,
      kind: "INCIDENT",
      state: "RESOLVED",
      title: incident.title,
      observedAt: observedAt.toISOString()
    }));
}

export function rykasCardsToEvents(cards: OwnerActionCard[], observedAt: Date): SourceEvent[] {
  return cards.map((card) => ({
    version: 1,
    system: "RYKAS",
    sourceId: safeId(card.id),
    kind: "ACTION",
    state: "OPEN",
    title: card.title.slice(0, 200),
    doneWhen: card.kind === "BUY_REVIEW" ? "Bought, declined or deferred in Supplier OS" : card.kind === "DECISION" ? "Decision recorded in Agent HQ" : null,
    url: httpsOrNull(card.href),
    durationMinutes: Math.max(5, card.minutes ?? 15),
    workContext: "DESK",
    projectKey: "rykas-ops",
    projectName: "Rykas operations",
    observedAt: observedAt.toISOString()
  }));
}

export function goneEvents(system: "RYKAS", previous: { sourceId: string; title: string }[], currentIds: Set<string>, observedAt: Date): SourceEvent[] {
  return previous
    .filter((item) => !currentIds.has(item.sourceId))
    .map((item) => ({ version: 1, system, sourceId: item.sourceId, kind: "ACTION", state: "GONE", title: item.title, observedAt: observedAt.toISOString() }));
}

// Gmail: one agreed signal (star). Subject lines are checked for PHI and the
// whole message is skipped if flagged; bodies are never read.
export type StarredMessage = { id: string; threadId: string; subject: string | null; from: string | null; internalDate: string | null };

export function starredToEvents(messages: StarredMessage[], observedAt: Date, blockedSenderDomains: string[] = []): SourceEvent[] {
  return messages.flatMap((message): SourceEvent[] => {
    const from = (message.from ?? "").toLowerCase();
    if (blockedSenderDomains.some((domain) => domain && from.includes(domain.toLowerCase()))) return [];
    const subject = (message.subject ?? "(no subject)").replace(/\s+/g, " ").trim().slice(0, 180);
    if (detectPhi(subject).length > 0) return [];
    return [{
      version: 1,
      system: "EMAIL",
      sourceId: safeId(`gmail-${message.id}`),
      kind: "ACTION",
      state: "OPEN",
      title: `Email: ${subject}`,
      doneWhen: null,
      url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.threadId)}`,
      needsJudgment: true,
      observedAt: observedAt.toISOString()
    }];
  });
}
