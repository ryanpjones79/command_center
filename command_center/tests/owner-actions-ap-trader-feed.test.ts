import { afterEach, describe, expect, it } from "vitest";
import {
  apCardsForBot,
  buildApTraderFeed,
  loadApTraderFeed,
  parseApBotTargets,
  type ApBotTarget
} from "@/server/today-feed/ap-trader-feed";

const NOW = new Date("2026-11-19T16:00:00.000Z");
const bot: ApBotTarget = { name: "AP Trader", baseUrl: "https://trader.example" };
const props: ApBotTarget = { name: "AP Props", baseUrl: "https://props.example" };

afterEach(() => {
  delete process.env.AP_TRADER_STATUS_URLS;
});

describe("AP Trader Today feed", () => {
  it("parses named https targets and drops anything else", () => {
    expect(parseApBotTargets("AP Trader|https://trader.example/, http://insecure.example, https://plain.example")).toEqual([
      { name: "AP Trader", baseUrl: "https://trader.example" },
      { name: "plain.example", baseUrl: "https://plain.example" }
    ]);
    expect(parseApBotTargets(undefined)).toEqual([]);
  });

  it("is off when no bots are configured", () => {
    expect(buildApTraderFeed([], NOW)).toMatchObject({ status: "OFF", cards: [] });
  });

  it("stays quiet for observe and paper bots even when blocked", () => {
    for (const mode of ["observe", "paper"]) {
      expect(apCardsForBot({ target: bot, ok: true, status: { mode, blocker: "orders blocked: MODE_OBSERVE", unresolved_orders: 2 } })).toEqual([]);
    }
  });

  it("raises unresolved orders, blockers and stopped venues for a live bot", () => {
    const cards = apCardsForBot({
      target: bot,
      ok: true,
      status: {
        mode: "live",
        blocker: "Unabated feed not healthy",
        next_action: "check network; process reconnects automatically",
        unresolved_orders: 1,
        venues: { novig: { stopped: "DAILY_LOSS_LIMIT" }, kalshi: { stopped: null } }
      }
    });
    expect(cards.map((card) => card.title)).toEqual([
      "AP Trader: 1 unresolved order",
      "AP Trader: Unabated feed not healthy",
      "AP Trader: novig stopped"
    ]);
    expect(cards[2].whyNow).toBe("Reason: DAILY_LOSS_LIMIT");
    expect(cards.every((card) => card.href === "https://trader.example" && card.external)).toBe(true);
  });

  it("flags a live props bot only when orders are on and every venue is blocked", () => {
    const blocked = apCardsForBot({ target: props, ok: true, status: { mode: "live", execution: { orders_enabled: true, blockers: { novig: ["NO_KEY"], kalshi: ["LIMIT"] } } } });
    expect(blocked).toHaveLength(1);
    const partly = apCardsForBot({ target: props, ok: true, status: { mode: "live", execution: { orders_enabled: true, blockers: { novig: [], kalshi: ["LIMIT"] } } } });
    expect(partly).toEqual([]);
    const off = apCardsForBot({ target: props, ok: true, status: { mode: "live", execution: { orders_enabled: false, blockers: { novig: ["NO_KEY"] } } } });
    expect(off).toEqual([]);
  });

  it("reports all clear with each bot's mode", () => {
    const feed = buildApTraderFeed([
      { target: bot, ok: true, status: { mode: "live", blocker: "none", unresolved_orders: 0 } },
      { target: props, ok: true, status: { mode: "paper" } }
    ], NOW);
    expect(feed).toMatchObject({ status: "EMPTY", message: "All clear: AP Trader live · AP Props paper.", cards: [] });
  });

  it("turns a failed or malformed status check into a reach-the-bot card, using GET only", async () => {
    process.env.AP_TRADER_STATUS_URLS = "AP Trader|https://trader.example,AP Props|https://props.example";
    const calls: { url: string; method: string | undefined }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      if (url.startsWith("https://trader.example")) return new Response("nope", { status: 503 });
      return new Response(JSON.stringify({ mode: 7 }), { status: 200 });
    }) as unknown as typeof fetch;
    const feed = await loadApTraderFeed(fakeFetch, NOW);
    expect(calls).toEqual([
      { url: "https://trader.example/status.json", method: undefined },
      { url: "https://props.example/status.json", method: undefined }
    ]);
    expect(feed.cards.map((card) => card.title)).toEqual(["Can't reach AP Trader", "Can't reach AP Props"]);
    expect(feed.cards[0].whyNow).toContain("HTTP 503");
    expect(feed.cards[1].whyNow).toContain("unexpected status format");
  });
});
