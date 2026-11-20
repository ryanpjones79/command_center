import { z } from "zod";
import {
  capOwnerActions,
  truncateText,
  type OwnerActionCard,
  type OwnerActionFeed
} from "@/lib/owner-actions";

// AP Trader feed for Today.
//
// Reads each configured bot's existing public GET /status.json and nothing
// else: no POST, no /stop, no keys, no orders. Off unless
// AP_TRADER_STATUS_URLS is set, e.g.
//   AP_TRADER_STATUS_URLS="AP Trader|https://ap-trader-production.up.railway.app,AP Props|https://ap-props-production.up.railway.app"
//
// Only live bots raise cards. Observe/paper bots are quiet by design, and a
// props bot with orders_enabled=false is treated as intentionally off.
// Positions, P&L and balances are never copied into RyanOS.

const MAX_BOTS = 6;
const FETCH_TIMEOUT_MS = 4000;

export type ApBotTarget = { name: string; baseUrl: string };

export function parseApBotTargets(raw: string | undefined): ApBotTarget[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, url] = entry.includes("|") ? entry.split("|", 2) : [null, entry];
      const baseUrl = (url ?? "").trim().replace(/\/+$/, "");
      return { name: (name ?? "").trim() || baseUrl.replace(/^https:\/\//, ""), baseUrl };
    })
    .filter((target) => /^https:\/\/[^\s/]+/.test(target.baseUrl))
    .slice(0, MAX_BOTS);
}

// Lenient: only the fields the feed uses; everything else is ignored.
const statusSchema = z
  .object({
    mode: z.string().max(40).optional(),
    blocker: z.string().max(500).optional(),
    next_action: z.string().max(500).optional(),
    unresolved_orders: z.number().int().nonnegative().optional(),
    venues: z
      .record(z.object({ stopped: z.union([z.string(), z.boolean(), z.null()]).optional() }).passthrough())
      .optional(),
    execution: z
      .object({
        orders_enabled: z.boolean().optional(),
        blockers: z.record(z.array(z.string()).or(z.string()).or(z.null())).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export type ApBotStatus = z.infer<typeof statusSchema>;

export type ApBotReading =
  | { target: ApBotTarget; ok: true; status: ApBotStatus }
  | { target: ApBotTarget; ok: false; error: string };

function hasBlockers(value: string[] | string | null | undefined) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function apCardsForBot(reading: ApBotReading): OwnerActionCard[] {
  const { name, baseUrl } = reading.target;
  const base = { area: "AP_TRADER" as const, dueAt: null, href: baseUrl, external: true, source: `${name} status` };

  if (!reading.ok) {
    return [{
      ...base,
      id: `ap:${name}:unreachable`,
      kind: "FIX",
      title: `Can't reach ${name}`,
      whyNow: truncateText(`Status check failed (${reading.error}). Confirm the bot is running.`, 160),
      minutes: 5
    }];
  }

  const status = reading.status;
  if (status.mode !== "live") return [];
  const cards: OwnerActionCard[] = [];

  if ((status.unresolved_orders ?? 0) > 0) {
    const count = status.unresolved_orders as number;
    cards.push({
      ...base,
      id: `ap:${name}:unresolved`,
      kind: "FIX",
      title: `${name}: ${count} unresolved order${count === 1 ? "" : "s"}`,
      whyNow: "Exposure stays reserved until these reconcile. Check them.",
      minutes: 5
    });
  }

  if (status.blocker && status.blocker !== "none") {
    cards.push({
      ...base,
      id: `ap:${name}:blocker`,
      kind: "FIX",
      title: truncateText(`${name}: ${status.blocker}`, 110),
      whyNow: truncateText(status.next_action ? `Next: ${status.next_action}` : "Live bot is not trading.", 160),
      minutes: 10
    });
  }

  for (const [venue, info] of Object.entries(status.venues ?? {})) {
    if (!info.stopped) continue;
    cards.push({
      ...base,
      id: `ap:${name}:stopped:${venue}`,
      kind: "FIX",
      title: truncateText(`${name}: ${venue} stopped`, 110),
      whyNow: truncateText(typeof info.stopped === "string" ? `Reason: ${info.stopped}` : "Venue stopped trading.", 160),
      minutes: 5
    });
  }

  const execution = status.execution;
  if (execution?.orders_enabled && execution.blockers) {
    const entries = Object.entries(execution.blockers);
    if (entries.length > 0 && entries.every(([, value]) => hasBlockers(value))) {
      cards.push({
        ...base,
        id: `ap:${name}:orders-blocked`,
        kind: "FIX",
        title: `${name}: orders on, but every venue is blocked`,
        whyNow: truncateText(
          entries.map(([venue, value]) => `${venue}: ${Array.isArray(value) ? value.join(", ") : value}`).join("; "),
          160
        ),
        minutes: 10
      });
    }
  }

  return cards;
}

export function buildApTraderFeed(readings: ApBotReading[], observedAt: Date): OwnerActionFeed {
  if (readings.length === 0) {
    return {
      area: "AP_TRADER",
      status: "OFF",
      message: "AP Trader feed is off. Set AP_TRADER_STATUS_URLS to turn it on.",
      observedAt: null,
      cards: []
    };
  }
  const cards = capOwnerActions(readings.flatMap(apCardsForBot));
  const modes = readings
    .map((reading) => `${reading.target.name} ${reading.ok ? reading.status.mode ?? "unknown" : "unreachable"}`)
    .join(" · ");
  return {
    area: "AP_TRADER",
    status: cards.length ? "READY" : "EMPTY",
    message: cards.length ? modes : `All clear: ${modes}.`,
    observedAt: observedAt.toISOString(),
    cards
  };
}

async function readBot(target: ApBotTarget, fetcher: typeof fetch): Promise<ApBotReading> {
  try {
    const response = await fetcher(`${target.baseUrl}/status.json`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return { target, ok: false, error: `HTTP ${response.status}` };
    const parsed = statusSchema.safeParse(await response.json());
    return parsed.success ? { target, ok: true, status: parsed.data } : { target, ok: false, error: "unexpected status format" };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { target, ok: false, error: name === "TimeoutError" || name === "AbortError" ? "timed out" : "no response" };
  }
}

export async function loadApTraderFeed(
  fetcher: typeof fetch = fetch,
  now = new Date()
): Promise<OwnerActionFeed> {
  const targets = parseApBotTargets(process.env.AP_TRADER_STATUS_URLS);
  const readings = await Promise.all(targets.map((target) => readBot(target, fetcher)));
  return buildApTraderFeed(readings, now);
}
