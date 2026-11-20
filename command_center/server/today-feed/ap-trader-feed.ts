import { z } from "zod";
import {
  capOwnerActions,
  truncateText,
  type OwnerActionCard,
  type OwnerActionFeed,
  type OwnerFeedSummary
} from "@/lib/owner-actions";

// AP Trader feed for Today.
//
// Reads each configured bot's existing GET /status.json and nothing else: no
// POST, no /stop, no keys, no orders. Off unless AP_TRADER_STATUS_URLS is set:
//   AP_TRADER_STATUS_URLS="AP Trader|https://ap.rykasinc.com,AP Props|https://ap-props-production.up.railway.app"
//
// Signals and noise rules come from the AP Trader session (2026-11-19):
// - The core trader's status.json is ~5 MB and building it competes with
//   trading. Poll at most every few minutes, 15 s timeout, never in parallel.
//   This module caches one reading set per server instance for CACHE_MS,
//   shares one in-flight refresh, and reads bots one at a time. Today loads it
//   in the background so the page never waits on it.
// - Only live bots raise cards. Observe/paper bots, paper/shadow sections and
//   props with orders_enabled=false are intentionally quiet.
// - Deploy windows (~5-6 min of HALT/restart) are suppressed: state-based
//   cards need the process up for at least SETTLE_S seconds.
// - Conditions with no timestamp of their own (ws down, maker not ready,
//   restarts climbing) only fire after this server instance has seen them
//   persist across readings. A cold instance under-alerts, never over-alerts.
//   The trader's own Pushover/SMS alerts remain the real pager.
// Positions and balances are never used. Today's settled P&L (pnl.today) is
// shown as a display-only line at Ryan's request; it is never stored and never
// raises a card (the maker's own loss stop already does that).

const MAX_BOTS = 6;
const AUTH_ERROR = "READ_TOKEN_REJECTED";
const FETCH_TIMEOUT_MS = 15_000;
export const CACHE_MS = 3 * 60_000;
const SETTLE_S = 600;
const UNRESOLVED_RECENT_S = 15 * 60;
const VENUE_BLOCKED_S = 10 * 60;
const WS_DOWN_MS = 5 * 60_000;
const MAKER_NOT_READY_MS = 10 * 60_000;
const ARBX_NOT_OWNED_MS = 10 * 60_000;
const MAKER_RESTART_WINDOW_MS = 30 * 60_000;
const MAKER_RESTART_LIMIT = 5;
const MEMORY_LIMIT_MB = 13_500;

// Optional third field names the env var holding that bot's read token, e.g.
//   "AP Trader|https://ap.rykasinc.com|AP_TRADER_READ_TOKEN"
// The token itself lives only in the secret store, is sent only to that bot as
// `Authorization: Bearer`, and is never logged. No env var / empty value means
// the request goes out unchanged.
export type ApBotTarget = { name: string; baseUrl: string; tokenEnv?: string };

export function parseApBotTargets(raw: string | undefined): ApBotTarget[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): ApBotTarget => {
      const parts = entry.split("|").map((part) => part.trim());
      const [name, url, tokenEnv] = parts.length === 1 ? [null, parts[0], undefined] : parts;
      const baseUrl = (url ?? "").replace(/\/+$/, "");
      const target: ApBotTarget = { name: (name ?? "") || baseUrl.replace(/^https:\/\//, ""), baseUrl };
      if (tokenEnv && /^[A-Z][A-Z0-9_]{0,63}$/.test(tokenEnv)) target.tokenEnv = tokenEnv;
      return target;
    })
    .filter((target) => /^https:\/\/[^\s/]+/.test(target.baseUrl))
    .slice(0, MAX_BOTS);
}

function readToken(target: ApBotTarget) {
  const value = target.tokenEnv ? process.env[target.tokenEnv]?.trim() : "";
  return value && /^[\x21-\x7e]+$/.test(value) ? value : null;
}

const num = z.number().finite();
// Lenient: only the fields the feed uses; everything else is ignored.
const statusSchema = z
  .object({
    now_ms: num.optional(),
    mode: z.string().max(40).optional(),
    states: z.record(z.boolean()).optional(),
    blocker: z.string().max(500).optional(),
    next_action: z.string().max(500).optional(),
    unresolved_detail: z
      .array(z.object({ venue: z.string().nullable().optional(), age_s: num.optional(), state: z.string().nullable().optional() }).passthrough())
      .optional(),
    venues: z
      .record(
        z
          .object({
            stopped: z.union([z.string(), z.boolean(), z.null()]).optional(),
            order_blockers: z.array(z.string()).optional(),
            ws_connected: z.boolean().optional()
          })
          .passthrough()
      )
      .optional(),
    health: z
      .object({
        blocker: z.object({ since: num.nullable().optional() }).passthrough().nullable().optional(),
        blocker_codes_since: z.record(z.record(num)).optional()
      })
      .passthrough()
      .optional(),
    startup_jobs: z.object({ uptime_s: num.optional() }).passthrough().optional(),
    arbhealth: z
      .object({
        alerts: z
          .array(z.object({ key: z.string(), priority: z.string().optional(), text: z.string().optional(), clearing: z.boolean().optional() }).passthrough())
          .optional()
      })
      .passthrough()
      .optional(),
    maker_fair: z
      .object({
        process: z
          .object({
            ready: z.boolean().optional(),
            restarts: num.optional(),
            trial_live: z
              .object({
                daily_pnl_usd: num.nullable().optional(),
                daily_loss_stop_usd: num.nullable().optional(),
                pause: z.object({ paused: z.boolean().optional() }).passthrough().nullable().optional()
              })
              .passthrough()
              .nullable()
              .optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional(),
    arbx: z
      .object({ service: z.object({ state: z.string().optional(), transitions: z.array(z.object({ at_ms: num.optional(), to: z.string().optional() }).passthrough()).optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
    memory: z
      .object({ procs: z.object({ procs: z.array(z.object({ rss_mb: num.optional() }).passthrough()).optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
    arbitrage: z
      .object({
        execution: z
          .object({ held_days: z.record(z.object({ after_retry: z.object({ n: num.optional() }).passthrough().optional() }).passthrough()).optional() })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional(),
    execution: z
      .object({
        orders_enabled: z.boolean().optional(),
        blockers: z.record(z.array(z.string()).or(z.string()).or(z.null())).optional()
      })
      .passthrough()
      .optional(),
    // Display only (Ryan asked 2026-11-19). Never an alert condition.
    pnl: z
      .object({
        today: z
          .object({
            day: z.string().optional(),
            settled_usd: num.nullable().optional(),
            arb_usd: num.nullable().optional(),
            arb_n: num.optional(),
            td_usd: num.nullable().optional(),
            td_n: num.optional(),
            drops_usd: num.nullable().optional(),
            drops_n: num.optional(),
            maker_usd: num.nullable().optional(),
            maker_n: num.optional(),
            manual_usd: num.nullable().optional(),
            manual_n: num.optional(),
            arb_locked_open_usd: num.nullable().optional(),
            with_locked_usd: num.nullable().optional(),
            risk_usd: num.nullable().optional()
          })
          .passthrough()
          .nullable()
          .optional(),
        days: z.array(z.object({ day: z.string().optional(), total_usd: num.nullable().optional() }).passthrough()).optional()
      })
      .passthrough()
      .nullable()
      .optional()
  })
  .passthrough();

export type ApBotStatus = z.infer<typeof statusSchema>;

export type ApBotReading =
  | { target: ApBotTarget; ok: true; status: ApBotStatus; readAtMs: number }
  | { target: ApBotTarget; ok: false; error: string; readAtMs: number };

// Per-instance memory of when a timestamp-less condition was first seen, plus
// maker restart counts, so "persists > N min" rules can be evaluated.
export type ApMemory = {
  firstSeen: Map<string, number>;
  restarts: Map<string, { atMs: number; count: number }[]>;
};
export function createApMemory(): ApMemory {
  return { firstSeen: new Map(), restarts: new Map() };
}

function persisted(memory: ApMemory, key: string, active: boolean, nowMs: number, forMs: number) {
  if (!active) {
    memory.firstSeen.delete(key);
    return false;
  }
  const first = memory.firstSeen.get(key) ?? nowMs;
  memory.firstSeen.set(key, first);
  return nowMs - first >= forMs;
}

function hasBlockers(value: string[] | string | null | undefined) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function pacificDateKey(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function sinceSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return value > 1e12 ? value / 1000 : value; // accept ms or s epochs
}

export function apCardsForBot(reading: ApBotReading, memory: ApMemory = createApMemory()): OwnerActionCard[] {
  const { name, baseUrl } = reading.target;
  const base = { area: "AP_TRADER" as const, dueAt: null, href: baseUrl, external: true, source: `${name} status` };
  const card = (id: string, title: string, whyNow: string, minutes = 5): OwnerActionCard => ({
    ...base,
    id: `ap:${name}:${id}`,
    kind: "FIX",
    title: truncateText(title, 110),
    whyNow: truncateText(whyNow, 160),
    minutes
  });

  if (!reading.ok) {
    if (reading.error === AUTH_ERROR) {
      return [card(
        "read-token",
        `${name}: read token missing/invalid`,
        reading.target.tokenEnv
          ? `The bot is up but rejected the read. Check ${reading.target.tokenEnv} in Railway variables.`
          : "The bot is up but now needs a read token. Add a token variable for it in Railway.",
        2
      )];
    }
    return [card("unreachable", `Can't reach ${name}`, `Status check failed (${reading.error}). Confirm the bot is running.`)];
  }

  const s = reading.status;
  if (s.mode !== "live") return [];
  const nowMs = s.now_ms ?? reading.readAtMs;
  const nowS = nowMs / 1000;
  const uptime = s.startup_jobs?.uptime_s;
  const settled = uptime === undefined || uptime >= SETTLE_S;
  const cards: OwnerActionCard[] = [];

  // Hard stops first: loss stop / pause, stopped venues, held arb legs.
  const trial = s.maker_fair?.process?.trial_live;
  if (trial) {
    const stop = trial.daily_loss_stop_usd;
    if (trial.pause?.paused) {
      cards.push(card("maker-paused", `${name}: live maker trial is paused`, "The maker trial stopped quoting. Check why before the next session."));
    } else if (typeof stop === "number" && stop > 0 && typeof trial.daily_pnl_usd === "number" && trial.daily_pnl_usd <= -stop) {
      cards.push(card("maker-loss-stop", `${name}: maker daily loss stop hit`, "Today's maker loss reached the daily stop."));
    }
  }

  for (const [venue, info] of Object.entries(s.venues ?? {})) {
    if (info.stopped) {
      cards.push(card(`stopped:${venue}`, `${name}: ${venue} stopped`, typeof info.stopped === "string" ? `Reason: ${info.stopped}` : "Venue stopped trading."));
    }
  }

  const heldToday = s.arbitrage?.execution?.held_days?.[pacificDateKey(nowMs)]?.after_retry?.n ?? 0;
  if (heldToday > 0) {
    cards.push(card("held-after-retry", `${name}: ${heldToday} arb leg${heldToday === 1 ? "" : "s"} still held after retry`, "Rule breach: an arb leg stayed held after the strand retry today."));
  }

  for (const alert of s.arbhealth?.alerts ?? []) {
    if (alert.priority !== "emergency" || alert.clearing || alert.key.startsWith("arbhealth_coverage_")) continue;
    cards.push(card(`arbhealth:${alert.key}`, `${name}: ${alert.text ?? alert.key}`, "Arb health emergency alert."));
  }

  // New unresolved orders only; old stuck records are known and ignored.
  const recentUnresolved = (s.unresolved_detail ?? []).filter((item) => typeof item.age_s === "number" && item.age_s < UNRESOLVED_RECENT_S);
  if (recentUnresolved.length > 0) {
    cards.push(card("unresolved", `${name}: ${recentUnresolved.length} new unresolved order${recentUnresolved.length === 1 ? "" : "s"}`, "Placed in the last 15 minutes and not reconciled yet. Exposure stays reserved."));
  }

  // State and blocker cards wait out deploy windows.
  if (settled) {
    const down = Object.entries(s.states ?? {}).filter(([, value]) => value === false).map(([key]) => key.replace(/_/g, " "));
    if (down.length > 0) {
      cards.push(card("states", `${name}: not ${down.join(", ")}`, s.next_action ? `Next: ${s.next_action}` : "A core trader state is off.", 10));
    }

    const blockerSince = sinceSeconds(s.health?.blocker?.since);
    if (s.blocker && s.blocker !== "none" && (blockerSince === null || nowS - blockerSince >= SETTLE_S) && down.length === 0) {
      cards.push(card("blocker", `${name}: ${s.blocker}`, s.next_action ? `Next: ${s.next_action}` : "Live bot is not trading.", 10));
    }

    for (const [venue, info] of Object.entries(s.venues ?? {})) {
      if (info.stopped) continue;
      if ((info.order_blockers ?? []).length > 0) {
        const codes = s.health?.blocker_codes_since?.[venue] ?? {};
        const starts = Object.values(codes).map((value) => sinceSeconds(value)).filter((value): value is number => value !== null);
        const oldEnough = starts.length > 0 ? nowS - Math.min(...starts) >= VENUE_BLOCKED_S : persisted(memory, `${name}:blocked:${venue}`, true, nowMs, VENUE_BLOCKED_S);
        if (oldEnough) cards.push(card(`blocked:${venue}`, `${name}: ${venue} orders blocked`, (info.order_blockers ?? []).join(", ")));
      } else {
        persisted(memory, `${name}:blocked:${venue}`, false, nowMs, VENUE_BLOCKED_S);
      }
      if (persisted(memory, `${name}:ws:${venue}`, info.ws_connected === false, nowMs, WS_DOWN_MS)) {
        cards.push(card(`ws:${venue}`, `${name}: ${venue} feed disconnected`, "The venue websocket has been down for over 5 minutes."));
      }
    }

    const maker = s.maker_fair?.process;
    if (persisted(memory, `${name}:maker-ready`, maker?.ready === false, nowMs, MAKER_NOT_READY_MS)) {
      cards.push(card("maker-ready", `${name}: maker not ready for 10+ minutes`, "The maker process is down or restarting. This caused a 5-hour outage on 11-18."));
    }
    if (typeof maker?.restarts === "number") {
      const history = (memory.restarts.get(name) ?? []).filter((item) => nowMs - item.atMs <= MAKER_RESTART_WINDOW_MS);
      history.push({ atMs: nowMs, count: maker.restarts });
      memory.restarts.set(name, history);
      const climbed = maker.restarts - Math.min(...history.map((item) => item.count));
      if (climbed > MAKER_RESTART_LIMIT) {
        cards.push(card("maker-restarts", `${name}: maker restarted ${climbed} times in 30 minutes`, "Restarts are climbing fast. Check the maker process."));
      }
    }

    const arbx = s.arbx?.service;
    if (arbx?.state && arbx.state !== "OWNED") {
      const lastMove = [...(arbx.transitions ?? [])].reverse().find((item) => item.to === arbx.state)?.at_ms;
      const long = typeof lastMove === "number" ? nowMs - lastMove >= ARBX_NOT_OWNED_MS : persisted(memory, `${name}:arbx`, true, nowMs, ARBX_NOT_OWNED_MS);
      if (long) cards.push(card("arbx", `${name}: arbx service is ${arbx.state}`, "Not OWNED for over 10 minutes, so the trader has the routes back."));
    } else {
      persisted(memory, `${name}:arbx`, false, nowMs, ARBX_NOT_OWNED_MS);
    }

    const totalMb = (s.memory?.procs?.procs ?? []).reduce((sum, proc) => sum + (proc.rss_mb ?? 0), 0);
    if (totalMb > MEMORY_LIMIT_MB) {
      cards.push(card("memory", `${name}: memory at ${(totalMb / 1024).toFixed(1)} GB`, "Above 13.5 GB on a 15.7 GB host. Out-of-memory risk."));
    }
  }

  // Props: only when orders are on and every venue is blocked.
  const execution = s.execution;
  if (execution?.orders_enabled && execution.blockers) {
    const entries = Object.entries(execution.blockers);
    if (entries.length > 0 && entries.every(([, value]) => hasBlockers(value))) {
      cards.push(card(
        "orders-blocked",
        `${name}: orders on, but every venue is blocked`,
        entries.map(([venue, value]) => `${venue}: ${Array.isArray(value) ? value.join(", ") : value}`).join("; "),
        10
      ));
    }
  }

  return cards;
}

function usd(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

// Settled P&L today from the first live bot that reports it (the core trader;
// props has none while its orders are off). Pacific day, per the trader.
export function apPnlSummary(readings: ApBotReading[]): OwnerFeedSummary | null {
  for (const reading of readings) {
    if (!reading.ok) continue;
    const today = reading.status.pnl?.today;
    if (!today || typeof today.settled_usd !== "number") continue;
    const nowMs = reading.status.now_ms ?? reading.readAtMs;
    const isToday = !today.day || today.day === pacificDateKey(nowMs);
    const locked = today.arb_locked_open_usd;
    const lockedText = typeof locked === "number" && locked !== 0 ? ` (${usd(locked)} locked arbs pending)` : "";
    const headline = `${reading.target.name} ${isToday ? "today" : today.day}: ${usd(today.settled_usd)} settled${lockedText}`;

    const engines: [string, number | null | undefined, number | undefined][] = [
      ["Arb", today.arb_usd, today.arb_n],
      ["Top-down", today.td_usd, today.td_n],
      ["Drops", today.drops_usd, today.drops_n],
      ["Maker", today.maker_usd, today.maker_n],
      ["Manual", today.manual_usd, today.manual_n]
    ];
    const split = engines
      .filter(([, value, n]) => typeof value === "number" && (value !== 0 || (n ?? 0) > 0))
      .map(([label, value, n]) => `${label} ${usd(value as number)}${typeof n === "number" ? ` (${n})` : ""}`);
    const detail: string[] = [];
    if (split.length) detail.push(split.join(" · "));
    if (typeof today.with_locked_usd === "number") detail.push(`With today's locked arbs: ${usd(today.with_locked_usd)}`);
    if (typeof today.risk_usd === "number") detail.push(`Open risk today: $${today.risk_usd.toFixed(2)}`);
    const week = (reading.status.pnl?.days ?? []).slice(0, 7).filter((day) => typeof day.total_usd === "number");
    if (week.length === 7) detail.push(`Last 7 days: ${usd(week.reduce((sum, day) => sum + (day.total_usd as number), 0))}`);
    return { headline, detail };
  }
  return null;
}

export function buildApTraderFeed(readings: ApBotReading[], observedAt: Date, memory: ApMemory = createApMemory()): OwnerActionFeed {
  if (readings.length === 0) {
    return {
      area: "AP_TRADER",
      status: "OFF",
      message: "AP Trader feed is off. Set AP_TRADER_STATUS_URLS to turn it on.",
      observedAt: null,
      cards: []
    };
  }
  const cards = capOwnerActions(readings.flatMap((reading) => apCardsForBot(reading, memory)));
  const modes = readings
    .map((reading) => `${reading.target.name} ${reading.ok ? reading.status.mode ?? "unknown" : "unreachable"}`)
    .join(" · ");
  return {
    area: "AP_TRADER",
    status: cards.length ? "READY" : "EMPTY",
    message: cards.length ? modes : `All clear: ${modes}.`,
    observedAt: observedAt.toISOString(),
    cards,
    summary: apPnlSummary(readings)
  };
}

async function readBot(target: ApBotTarget, fetcher: typeof fetch, nowMs: number): Promise<ApBotReading> {
  try {
    const token = readToken(target);
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetcher(`${target.baseUrl}/status.json`, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (response.status === 401 || response.status === 403) {
      return { target, ok: false, error: AUTH_ERROR, readAtMs: nowMs };
    }
    if (!response.ok) return { target, ok: false, error: `HTTP ${response.status}`, readAtMs: nowMs };
    const parsed = statusSchema.safeParse(await response.json());
    return parsed.success
      ? { target, ok: true, status: parsed.data, readAtMs: nowMs }
      : { target, ok: false, error: "unexpected status format", readAtMs: nowMs };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { target, ok: false, error: name === "TimeoutError" || name === "AbortError" ? "timed out" : "no response", readAtMs: nowMs };
  }
}

type CacheEntry = { atMs: number; key: string; feed: OwnerActionFeed };
const state: { cache: CacheEntry | null; inflight: Promise<OwnerActionFeed> | null; memory: ApMemory } = {
  cache: null,
  inflight: null,
  memory: createApMemory()
};

export function resetApTraderCacheForTests() {
  state.cache = null;
  state.inflight = null;
  state.memory = createApMemory();
}

export async function loadApTraderFeed(fetcher: typeof fetch = fetch, now = () => new Date()): Promise<OwnerActionFeed> {
  const targets = parseApBotTargets(process.env.AP_TRADER_STATUS_URLS);
  const key = targets.map((target) => target.baseUrl).join(",");
  const started = now();
  if (state.cache && state.cache.key === key && started.getTime() - state.cache.atMs < CACHE_MS) return state.cache.feed;
  if (state.inflight) return state.inflight;

  state.inflight = (async () => {
    const readings: ApBotReading[] = [];
    for (const target of targets) readings.push(await readBot(target, fetcher, now().getTime())); // one at a time
    const feed = buildApTraderFeed(readings, started, state.memory);
    state.cache = { atMs: started.getTime(), key, feed };
    return feed;
  })().finally(() => {
    state.inflight = null;
  });
  return state.inflight;
}
