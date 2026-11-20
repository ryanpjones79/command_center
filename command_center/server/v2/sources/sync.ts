import type { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import { getGoogleOAuthClient } from "@/server/google-client";
import { loadApTraderFeed } from "@/server/today-feed/ap-trader-feed";
import { loadRykasFeed } from "@/server/today-feed/rykas-feed";
import { ingestSourceEvents, recordSourceSync } from "@/server/v2/ingest";
import { apCardsToEvents, apRecoveredEvents, goneEvents, rykasCardsToEvents, starredToEvents, type StarredMessage } from "@/server/v2/sources/adapters";

// Pulls the existing read-only readings into persistent actions. Throttled per
// source; a failed reading marks the source FAILING and changes nothing else.

const MIN_INTERVAL_MS = 10 * 60_000;

async function due(userId: string, system: string, db: PrismaClient, now: Date) {
  const sync = await db.sourceSync.findUnique({ where: { userId_sourceSystem: { userId, sourceSystem: system } } });
  return !sync?.lastAttemptAt || now.getTime() - sync.lastAttemptAt.getTime() >= MIN_INTERVAL_MS;
}

async function openKeys(userId: string, system: string, db: PrismaClient) {
  const rows = await db.executionTask.findMany({
    where: { userId, sourceSystem: system, status: { notIn: ["DONE", "DROPPED"] }, integrationSourceKey: { startsWith: `${system}:` } },
    select: { integrationSourceKey: true, title: true, status: true }
  });
  return rows.map((row) => ({ sourceId: (row.integrationSourceKey as string).slice(system.length + 1), title: row.title, status: row.status }));
}

export async function syncApTrader(userId: string, db: PrismaClient, now = new Date()) {
  if (!process.env.AP_TRADER_STATUS_URLS) return { skipped: "not configured" };
  if (!(await due(userId, "AP_TRADER", db, now))) return { skipped: "throttled" };
  const feed = await loadApTraderFeed();
  if (feed.status === "OFF") return { skipped: "off" };
  const unreachable = feed.cards.some((card) => card.id.endsWith(":unreachable") || card.id.endsWith(":read-token"));
  const events = apCardsToEvents(feed.cards, now);
  // Recovery only from a fully successful reading of every bot.
  const recovered = unreachable ? [] : apRecoveredEvents(await openKeys(userId, "AP_TRADER", db), new Set(events.map((event) => event.sourceId)), now);
  const results = await ingestSourceEvents(userId, [...events, ...recovered], db);
  await recordSourceSync(userId, "AP_TRADER", !unreachable, unreachable ? "A bot was unreachable" : null, db);
  return { events: results.length };
}

export async function syncRykas(userId: string, db: PrismaClient, now = new Date()) {
  if (!(await due(userId, "RYKAS", db, now))) return { skipped: "throttled" };
  const feed = await loadRykasFeed(userId, db, now);
  if (feed.status === "UNAVAILABLE" || feed.status === "OFF") {
    await recordSourceSync(userId, "RYKAS", false, feed.message ?? "unavailable", db);
    return { skipped: feed.status };
  }
  const events = rykasCardsToEvents(feed.cards, now);
  // Stale data is shown but never used to declare items gone.
  const gone = feed.status === "STALE" ? [] : goneEvents("RYKAS", await openKeys(userId, "RYKAS", db), new Set(events.map((event) => event.sourceId)), now);
  const results = await ingestSourceEvents(userId, [...events, ...gone], db);
  await recordSourceSync(userId, "RYKAS", feed.status !== "STALE", feed.status === "STALE" ? "Data is stale" : null, db);
  return { events: results.length };
}

// Requires FEATURE_GMAIL_CAPTURE=true AND a Google grant that includes
// gmail.readonly (the current bootstrap grants only gmail.send).
export async function syncStarredEmail(userId: string, db: PrismaClient, now = new Date()) {
  if (process.env.FEATURE_GMAIL_CAPTURE !== "true") return { skipped: "off" };
  if (!(await due(userId, "EMAIL", db, now))) return { skipped: "throttled" };
  try {
    const gmail = google.gmail({ version: "v1", auth: getGoogleOAuthClient() });
    const list = await gmail.users.messages.list({ userId: "me", q: "is:starred", maxResults: 50 });
    const messages: StarredMessage[] = [];
    for (const item of list.data.messages ?? []) {
      if (!item.id) continue;
      const message = await gmail.users.messages.get({ userId: "me", id: item.id, format: "metadata", metadataHeaders: ["Subject", "From"] });
      const header = (name: string) => message.data.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
      messages.push({ id: item.id, threadId: message.data.threadId ?? item.id, subject: header("Subject"), from: header("From"), internalDate: message.data.internalDate ?? null });
    }
    const blocked = (process.env.RYANOS_EMAIL_BLOCKED_DOMAINS ?? "cdcr.ca.gov,cchcs.ca.gov").split(",").map((value) => value.trim());
    // Unstarring is NOT completion: items missing from the starred list are left as they are.
    const results = await ingestSourceEvents(userId, starredToEvents(messages, now, blocked), db);
    await recordSourceSync(userId, "EMAIL", true, null, db);
    return { events: results.length };
  } catch {
    await recordSourceSync(userId, "EMAIL", false, "Gmail read failed (check gmail.readonly consent)", db);
    return { skipped: "failed" };
  }
}

export async function syncAllSources(userId: string, db: PrismaClient, now = new Date()) {
  const outcomes: Record<string, unknown> = {};
  for (const [name, run] of [["AP_TRADER", syncApTrader], ["RYKAS", syncRykas], ["EMAIL", syncStarredEmail]] as const) {
    try {
      outcomes[name] = await run(userId, db, now);
    } catch {
      outcomes[name] = { skipped: "error" };
      await recordSourceSync(userId, name, false, "Sync error", db).catch(() => undefined);
    }
  }
  return outcomes;
}
