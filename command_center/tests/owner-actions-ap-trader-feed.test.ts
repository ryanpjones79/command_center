import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apCardsForBot,
  buildApTraderFeed,
  createApMemory,
  loadApTraderFeed,
  parseApBotTargets,
  resetApTraderCacheForTests,
  type ApBotStatus,
  type ApBotTarget
} from "@/server/today-feed/ap-trader-feed";

// 2026-11-19 08:00 PT
const NOW_MS = Date.parse("2026-11-19T16:00:00.000Z");
const trader: ApBotTarget = { name: "AP Trader", baseUrl: "https://trader.example" };
const props: ApBotTarget = { name: "AP Props", baseUrl: "https://props.example" };

function healthy(overrides: Partial<ApBotStatus> = {}): ApBotStatus {
  return {
    now_ms: NOW_MS,
    mode: "live",
    states: { running: true, receiving_prices: true, evaluating: true, executing: true },
    blocker: "none",
    next_action: "trading on novig",
    unresolved_detail: [{ venue: "kalshi", state: "UNKNOWN", age_s: 1_269_120 }],
    venues: { novig: { stopped: null, order_blockers: [], ws_connected: true } },
    health: { blocker: { since: null }, blocker_codes_since: { novig: {} } },
    startup_jobs: { uptime_s: 7689 },
    arbhealth: { alerts: [] },
    maker_fair: { process: { ready: true, restarts: 0, trial_live: { daily_pnl_usd: -14.75, daily_loss_stop_usd: 150, pause: { paused: false } } } },
    arbx: { service: { state: "OWNED", transitions: [] } },
    memory: { procs: { procs: [{ rss_mb: 5625 }, { rss_mb: 6015 }] } },
    arbitrage: { execution: { held_days: { "2026-11-19": {} } } },
    ...overrides
  };
}

function cards(status: ApBotStatus, memory = createApMemory(), readAtMs = NOW_MS) {
  return apCardsForBot({ target: trader, ok: true, status, readAtMs }, memory).map((card) => card.id.replace("ap:AP Trader:", ""));
}

beforeEach(() => resetApTraderCacheForTests());
afterEach(() => {
  delete process.env.AP_TRADER_STATUS_URLS;
});

describe("AP Trader Today feed", () => {
  it("parses named https targets and drops anything else", () => {
    expect(parseApBotTargets("AP Trader|https://ap.rykasinc.com/, http://insecure.example, https://plain.example")).toEqual([
      { name: "AP Trader", baseUrl: "https://ap.rykasinc.com" },
      { name: "plain.example", baseUrl: "https://plain.example" }
    ]);
    expect(parseApBotTargets(undefined)).toEqual([]);
  });

  it("is off when no bots are configured", () => {
    expect(buildApTraderFeed([], new Date(NOW_MS))).toMatchObject({ status: "OFF", cards: [] });
  });

  it("is quiet for a healthy live trader, including old stuck unresolved orders and coverage alerts", () => {
    expect(cards(healthy({
      arbhealth: { alerts: [{ key: "arbhealth_coverage_novig+polymarket_us", priority: "emergency", text: "coverage low" }] }
    }))).toEqual([]);
  });

  it("stays quiet for observe and paper bots", () => {
    expect(cards(healthy({ mode: "paper", states: { running: true, executing: false } }))).toEqual([]);
  });

  it("raises hard stops: loss stop, paused maker, stopped venue, held arb after retry, emergency alert", () => {
    expect(cards(healthy({ maker_fair: { process: { ready: true, restarts: 0, trial_live: { daily_pnl_usd: -151, daily_loss_stop_usd: 150, pause: { paused: false } } } } }))).toEqual(["maker-loss-stop"]);
    expect(cards(healthy({ maker_fair: { process: { ready: true, restarts: 0, trial_live: { daily_pnl_usd: 0, daily_loss_stop_usd: 150, pause: { paused: true } } } } }))).toEqual(["maker-paused"]);
    expect(cards(healthy({ venues: { novig: { stopped: "DAILY_LOSS_LIMIT", order_blockers: ["STOPPED"], ws_connected: true } } }))).toEqual(["stopped:novig"]);
    expect(cards(healthy({ arbitrage: { execution: { held_days: { "2026-11-19": { after_retry: { n: 1 } }, "2026-11-18": { after_retry: { n: 4 } } } } } }))).toEqual(["held-after-retry"]);
    expect(cards(healthy({ arbhealth: { alerts: [
      { key: "arbhealth_strand_held_x", priority: "emergency", text: "strand held" },
      { key: "arbhealth_speed_y", priority: "high", text: "slow" },
      { key: "arbhealth_match_z", priority: "emergency", text: "match", clearing: true }
    ] } }))).toEqual(["arbhealth:arbhealth_strand_held_x"]);
  });

  it("alerts only on unresolved orders newer than 15 minutes", () => {
    expect(cards(healthy({ unresolved_detail: [{ age_s: 1_269_120 }, { age_s: 120 }] }))).toEqual(["unresolved"]);
  });

  it("suppresses state and blocker cards during a deploy window", () => {
    const deploying = healthy({
      startup_jobs: { uptime_s: 300 },
      states: { running: true, receiving_prices: true, evaluating: true, executing: false },
      blocker: "orders blocked: HALT"
    });
    expect(cards(deploying)).toEqual([]);
    expect(cards({ ...deploying, startup_jobs: { uptime_s: 900 } })).toEqual(["states"]);
  });

  it("raises a blocker only once it has persisted 10 minutes", () => {
    const blocked = (sinceS: number) => healthy({ blocker: "Unabated feed not healthy", next_action: "check network", health: { blocker: { since: sinceS } } });
    expect(cards(blocked(NOW_MS / 1000 - 120))).toEqual([]);
    expect(cards(blocked(NOW_MS / 1000 - 900))).toEqual(["blocker"]);
  });

  it("uses venue blocker timestamps for the 10 minute rule", () => {
    const venueBlocked = (sinceS: number) => healthy({
      venues: { kalshi: { stopped: null, order_blockers: ["LIMIT"], ws_connected: true } },
      health: { blocker: { since: null }, blocker_codes_since: { kalshi: { LIMIT: sinceS } } }
    });
    expect(cards(venueBlocked(NOW_MS / 1000 - 300))).toEqual([]);
    expect(cards(venueBlocked(NOW_MS / 1000 - 700))).toEqual(["blocked:kalshi"]);
  });

  it("needs repeated readings for conditions with no timestamp (ws down, maker not ready)", () => {
    const memory = createApMemory();
    const down = (atMs: number) => healthy({ now_ms: atMs, venues: { novig: { stopped: null, order_blockers: [], ws_connected: false } }, maker_fair: { process: { ready: false, restarts: 0 } } });
    expect(cards(down(NOW_MS), memory)).toEqual([]);
    expect(cards(down(NOW_MS + 6 * 60_000), memory)).toEqual(["ws:novig"]);
    expect(cards(down(NOW_MS + 11 * 60_000), memory)).toEqual(["ws:novig", "maker-ready"]);
    expect(cards(healthy({ now_ms: NOW_MS + 12 * 60_000 }), memory)).toEqual([]);
  });

  it("flags maker restarts climbing more than 5 within 30 minutes", () => {
    const memory = createApMemory();
    const restarts = (atMs: number, count: number) => healthy({ now_ms: atMs, maker_fair: { process: { ready: true, restarts: count } } });
    expect(cards(restarts(NOW_MS, 2), memory)).toEqual([]);
    expect(cards(restarts(NOW_MS + 10 * 60_000, 8), memory)).toEqual(["maker-restarts"]);
  });

  it("flags arbx not OWNED for 10+ minutes using its transition time", () => {
    const arbx = (atMs: number) => healthy({ arbx: { service: { state: "FALLBACK", transitions: [{ at_ms: atMs, to: "FALLBACK" }] } } });
    expect(cards(arbx(NOW_MS - 2 * 60_000))).toEqual([]);
    expect(cards(arbx(NOW_MS - 12 * 60_000))).toEqual(["arbx"]);
  });

  it("flags memory above 13.5 GB total", () => {
    expect(cards(healthy({ memory: { procs: { procs: [{ rss_mb: 9000 }, { rss_mb: 5000 }] } } }))).toEqual(["memory"]);
  });

  it("flags a live props bot only when orders are on and every venue is blocked", () => {
    const run = (status: ApBotStatus) => apCardsForBot({ target: props, ok: true, status, readAtMs: NOW_MS });
    expect(run({ mode: "live", execution: { orders_enabled: true, blockers: { novig: ["NO_KEY"], kalshi: ["LIMIT"] } } })).toHaveLength(1);
    expect(run({ mode: "live", execution: { orders_enabled: true, blockers: { novig: [], kalshi: ["LIMIT"] } } })).toEqual([]);
    expect(run({ mode: "live", execution: { orders_enabled: false, blockers: { novig: ["PROPS_ORDERS_NOT_ENABLED"] } } })).toEqual([]);
  });

  it("shows today's settled P&L as a display-only line, never a card", () => {
    const status = healthy({
      pnl: {
        today: {
          day: "2026-11-19", settled_usd: -11.67, arb_usd: -19.92, arb_n: 11, td_usd: 60.79, td_n: 2,
          drops_usd: -34.47, drops_n: 4, maker_usd: -18.07, maker_n: 21, manual_usd: 0, manual_n: 0,
          arb_locked_open_usd: 14.71, with_locked_usd: 1.75, risk_usd: 367.14
        },
        days: [-11.67, 20, 5, -3, 10, 0, 4.5].map((total, index) => ({ day: `d${index}`, total_usd: total }))
      }
    });
    const feed = buildApTraderFeed([{ target: trader, ok: true, status, readAtMs: NOW_MS }], new Date(NOW_MS));
    expect(feed.cards).toEqual([]);
    expect(feed.summary).toEqual({
      headline: "AP Trader today: -$11.67 settled (+$14.71 locked arbs pending)",
      detail: [
        "Arb -$19.92 (11) · Top-down +$60.79 (2) · Drops -$34.47 (4) · Maker -$18.07 (21)",
        "With today's locked arbs: +$1.75",
        "Open risk today: $367.14",
        "Last 7 days: +$24.83"
      ]
    });
  });

  it("labels a P&L day that is not today and omits P&L when the bot has none", () => {
    const old = healthy({ pnl: { today: { day: "2026-11-18", settled_usd: 5 } } });
    expect(buildApTraderFeed([{ target: trader, ok: true, status: old, readAtMs: NOW_MS }], new Date(NOW_MS)).summary?.headline).toBe("AP Trader 2026-11-18: +$5.00 settled");
    expect(buildApTraderFeed([{ target: props, ok: true, status: { mode: "live" }, readAtMs: NOW_MS }], new Date(NOW_MS)).summary).toBeNull();
  });

  it("reads bots one at a time, GET only, and caches for three minutes", async () => {
    process.env.AP_TRADER_STATUS_URLS = "AP Trader|https://trader.example,AP Props|https://props.example";
    let active = 0;
    let maxActive = 0;
    const calls: { url: string; method: string | undefined }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (url.startsWith("https://trader.example")) return new Response("nope", { status: 404 });
      return new Response(JSON.stringify({ mode: 7 }), { status: 200 });
    }) as unknown as typeof fetch;

    let clock = NOW_MS;
    const now = () => new Date(clock);
    const [first, concurrent] = await Promise.all([loadApTraderFeed(fakeFetch, now), loadApTraderFeed(fakeFetch, now)]);
    expect(maxActive).toBe(1);
    expect(calls).toEqual([
      { url: "https://trader.example/status.json", method: undefined },
      { url: "https://props.example/status.json", method: undefined }
    ]);
    expect(concurrent).toBe(first);
    expect(first.cards.map((card) => card.title)).toEqual(["Can't reach AP Trader", "Can't reach AP Props"]);
    expect(first.cards[0].whyNow).toContain("HTTP 404");

    clock += 2 * 60_000;
    await loadApTraderFeed(fakeFetch, now);
    expect(calls).toHaveLength(2);
    clock += 2 * 60_000;
    await loadApTraderFeed(fakeFetch, now);
    expect(calls).toHaveLength(4);
  });
});
