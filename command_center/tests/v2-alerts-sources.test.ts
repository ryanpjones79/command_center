import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { OwnerActionCard } from "@/lib/owner-actions";
import { runNowAlerts } from "@/server/now/run-alerts";
import { ingestSourceEvents } from "@/server/v2/ingest";
import { ingestGoals } from "@/server/v2/goals-ingest";
import { captureTokenValid, ingestSystemForRequest } from "@/server/v2/inbound-auth";
import { apCardsToEvents, apRecoveredEvents, goneEvents, rykasCardsToEvents, starredToEvents } from "@/server/v2/sources/adapters";
import { createV2TestDb } from "./helpers/v2-db";

// FIXTURE DATA ONLY: these tests never contact a live source or send a live notification.

const pt = (iso: string) => new Date(`${iso}-08:00`);
let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("alerts"));
}, 60_000);
afterAll(async () => cleanup());
afterEach(() => {
  delete process.env.FEATURE_NOW_ALERTS;
});

describe("alert delivery (no live sends)", () => {
  it("sends each block ping once across retries, catches up a missed run, and follows moved blocks", async () => {
    process.env.FEATURE_NOW_ALERTS = "true";
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const task = await db.executionTask.create({ data: { userId, domainId: domain.id, title: "Approve PO", scheduledStart: pt("2026-11-23T10:00:00"), scheduledEnd: pt("2026-11-23T10:30:00") } });
    const sent: string[] = [];
    const send = async (alert: { title: string }) => {
      sent.push(alert.title);
      return { ok: true, error: null };
    };

    // first run establishes the marker
    await runNowAlerts(db, { now: pt("2026-11-23T09:50:00"), send, sync: false });
    // the 9:55 and 10:00 runs were missed; 10:07 catches the 10:00 start
    const dry = await runNowAlerts(db, { now: pt("2026-11-23T10:07:00"), dryRun: true });
    expect("wouldSend" in dry && dry.wouldSend?.map((a) => a.title)).toEqual(["Now: Approve PO"]);
    expect(sent).toEqual([]);
    await runNowAlerts(db, { now: pt("2026-11-23T10:07:00"), send, sync: false });
    // overlapping retry of the same window
    await runNowAlerts(db, { now: pt("2026-11-23T10:08:00"), send, sync: false });
    expect(sent).toEqual(["Now: Approve PO"]);

    // block moved to 10:45: its new start alerts once; marking done suppresses the end ping
    await db.executionTask.update({ where: { id: task.id }, data: { scheduledStart: pt("2026-11-23T10:45:00"), scheduledEnd: pt("2026-11-23T11:15:00") } });
    await runNowAlerts(db, { now: pt("2026-11-23T10:46:00"), send, sync: false });
    await db.executionTask.update({ where: { id: task.id }, data: { status: "DONE" } });
    await runNowAlerts(db, { now: pt("2026-11-23T11:16:00"), send, sync: false });
    expect(sent).toEqual(["Now: Approve PO", "Now: Approve PO"]);
  });

  it("a failed delivery is retried on the next run instead of being lost", async () => {
    process.env.FEATURE_NOW_ALERTS = "true";
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    await db.executionTask.create({ data: { userId, domainId: domain.id, title: "Ship orders", scheduledStart: pt("2026-11-23T13:00:00"), scheduledEnd: pt("2026-11-23T13:30:00") } });
    await runNowAlerts(db, { now: pt("2026-11-23T12:58:00"), send: async () => ({ ok: true, error: null }), sync: false });
    const failing = await runNowAlerts(db, { now: pt("2026-11-23T13:01:00"), send: async () => ({ ok: false, error: "down" }), sync: false });
    expect("failed" in failing && failing.failed).toBe(1);
    const titles: string[] = [];
    await runNowAlerts(db, { now: pt("2026-11-23T13:04:00"), send: async (alert) => { titles.push(alert.title); return { ok: true, error: null }; }, sync: false });
    expect(titles).toEqual(["Now: Ship orders"]);
  });
});

const card = (id: string, title: string, href = "https://ap.example"): OwnerActionCard => ({ id, area: "AP_TRADER", kind: "FIX", title, whyNow: "", minutes: 5, dueAt: null, href, external: true, source: "fixture" });

describe("source adapters (fixtures)", () => {
  it("5/6: AP incidents resolve only from a healthy reading; Rykas absences mark GONE, not done", async () => {
    const t0 = pt("2026-11-23T09:00:00");
    await ingestSourceEvents(userId, apCardsToEvents([card("ap:AP Trader:maker-ready", "AP Trader: maker not ready 10+ minutes")], t0), db);
    const open = await db.executionTask.findFirstOrThrow({ where: { userId, integrationSourceKey: "AP_TRADER:ap:AP-Trader:maker-ready" } });
    expect(open).toMatchObject({ sourceKind: "INCIDENT", sourceState: "OPEN" });
    const recovered = apRecoveredEvents([{ sourceId: "ap:AP-Trader:maker-ready", title: open.title }], new Set(), pt("2026-11-23T09:20:00"));
    await ingestSourceEvents(userId, recovered, db);
    expect(await db.executionTask.findUniqueOrThrow({ where: { id: open.id } })).toMatchObject({ status: "DONE", sourceState: "RESOLVED" });

    await ingestSourceEvents(userId, rykasCardsToEvents([{ ...card("rykas:opportunity:US:B000000001", "Review buy: Item A", "https://supplier.example/x"), area: "RYKAS", kind: "BUY_REVIEW" }], t0), db);
    await ingestSourceEvents(userId, goneEvents("RYKAS", [{ sourceId: "rykas:opportunity:US:B000000001", title: "Review buy: Item A" }], new Set(), pt("2026-11-23T09:30:00")), db);
    expect(await db.executionTask.findFirstOrThrow({ where: { userId, integrationSourceKey: "RYKAS:rykas:opportunity:US:B000000001" } })).toMatchObject({ status: "NOT_STARTED", sourceState: "GONE" });
  });

  it("16: a still-starred email does not recreate handled work; unstarring is not completion", async () => {
    const message = { id: "msg-1", threadId: "thr-1", subject: "Invoice from supplier", from: "billing@supplier.example", internalDate: null };
    await ingestSourceEvents(userId, starredToEvents([message], pt("2026-11-23T09:00:00")), db);
    const task = await db.executionTask.findFirstOrThrow({ where: { userId, integrationSourceKey: "EMAIL:gmail-msg-1" } });
    expect(task).toMatchObject({ needsJudgment: true, sourceUrl: "https://mail.google.com/mail/u/0/#all/thr-1" });
    await db.executionTask.update({ where: { id: task.id }, data: { status: "DONE" } });
    const again = await ingestSourceEvents(userId, starredToEvents([message], pt("2026-11-23T12:00:00")), db);
    expect(again[0].decision).toBe("IGNORE_HANDLED");
    expect(await db.executionTask.count({ where: { userId, integrationSourceKey: "EMAIL:gmail-msg-1" } })).toBe(1);
  });

  it("20: email from blocked work domains or with PHI-looking subjects is skipped before storage", () => {
    const events = starredToEvents([
      { id: "a", threadId: "a", subject: "Weekly report", from: "someone@cchcs.ca.gov", internalDate: null },
      { id: "b", threadId: "b", subject: "Patient John Smith DOB 01/02/1960 MRN 1234567", from: "x@gmail.com", internalDate: null }
    ], new Date(), ["cchcs.ca.gov"]);
    expect(events).toEqual([]);
  });

  it("17/19: source goals and results keep definition, period and source-verified evidence", async () => {
    const out = await ingestGoals(userId, "EBAY", [{ sourceKey: "listings-live", title: "eBay listings live", measureKind: "OUTCOME", metricName: "Listings live", metricDefinition: "Active listings reported by eBay app", unit: "listings", target: 40, period: "WEEK", url: "https://ebay-app.example/goals" }],
      [{ goalSourceKey: "listings-live", periodStart: "2026-11-23T08:00:00.000Z", periodEnd: "2026-11-30T08:00:00.000Z", value: 31, observedAt: "2026-11-24T18:00:00.000Z" }], db);
    expect(out).toEqual({ goals: 1, results: 1, rejected: 0 });
    const goal = await db.goal.findFirstOrThrow({ where: { userId, sourceKey: "listings-live" }, include: { results: true } });
    expect(goal).toMatchObject({ owner: "SOURCE", sourceSystem: "EBAY", target: 40, sourceUrl: "https://ebay-app.example/goals" });
    expect(goal.results[0]).toMatchObject({ evidence: "SOURCE_VERIFIED", value: 31 });
  });
});

describe("inbound auth", () => {
  it("binds each token to exactly one source and rejects short or missing tokens", () => {
    const env = { RYANOS_INGEST_TOKENS: JSON.stringify({ EBAY: "e".repeat(32), STORE_ROUTE: "short" }), RYANOS_CAPTURE_TOKEN: "c".repeat(32) };
    const req = (token: string) => new Request("https://x.test", { headers: { authorization: `Bearer ${token}` } });
    expect(ingestSystemForRequest(req("e".repeat(32)), env)).toBe("EBAY");
    expect(ingestSystemForRequest(req("short"), env)).toBeNull();
    expect(ingestSystemForRequest(new Request("https://x.test"), env)).toBeNull();
    expect(captureTokenValid(req("c".repeat(32)), env)).toBe(true);
    expect(captureTokenValid(req("nope"), env)).toBe(false);
  });
});
