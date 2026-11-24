import type { PrismaClient } from "@prisma/client";
import { alertsForWindow, inQuietHours, MAX_LOOKBACK_MS, sendPushover } from "@/server/now/alerts";
import { coachPushWorthy, loadCoach } from "@/server/v2/coach";
import { googleCalendarLoader } from "@/server/v2/day";
import { startOfZonedDay } from "@/lib/v2/zoned-time";
import { resolveOwnerUserId } from "@/server/v2/inbound-auth";
import { loadDaySettings, type CalendarLoader } from "@/server/v2/schedule-service";
import { materializeRoutines } from "@/server/v2/routines";
import { syncAllSources } from "@/server/v2/sources/sync";
import { syncCalendar } from "@/server/v2/calendar-sync";

// Runs source syncs, block alerts and the Coach nudge once (see app/api/cron/now-alerts/route.ts).
//
// Coach nudges ("You're free until 4:00. eBay listing for 45 min?", morning plan, evening wrap-up) are
// sent at most once per message, no more than one an hour, at most COACH_MAX_PER_DAY a day, never in
// quiet hours, and never in the same run as a block alert.

export const COACH_MAX_PER_DAY = 6;

const RUN_MARKER = "ALERTS";

export async function runNowAlerts(
  db: PrismaClient,
  options: { now?: Date; dryRun?: boolean; send?: typeof sendPushover; sync?: boolean; calendarLoader?: CalendarLoader } = {}
) {
  const now = options.now ?? new Date();
  const userId = await resolveOwnerUserId(db);
  if (!userId) return { ok: false, error: "Owner not configured" };
  const sync = options.sync === false || options.dryRun ? null : await syncAllSources(userId, db, now);
  if (!options.dryRun) await materializeRoutines(userId, db, now).catch(() => undefined);
  // Keep Google Calendar and RyanOS time blocks in step (off unless FEATURE_GOOGLE_CALENDAR_WRITE=true).
  const calendarSync = options.sync === false || options.dryRun ? null : await syncCalendar(userId, db, { now }).catch(() => null);
  if (process.env.FEATURE_NOW_ALERTS !== "true") return { ok: true, disabled: true, sync, calendarSync };

  const settings = await loadDaySettings(userId, db);
  const userSettings = await db.userSettings.findUnique({ where: { userId }, select: { quietStartMin: true, quietEndMin: true } });
  const marker = await db.sourceSync.findUnique({ where: { userId_sourceSystem: { userId, sourceSystem: RUN_MARKER } } });
  const windowStart = new Date(Math.max(now.getTime() - MAX_LOOKBACK_MS, (marker?.lastSuccessAt ?? new Date(now.getTime() - 5 * 60_000)).getTime()));

  const tasks = await db.executionTask.findMany({
    where: {
      userId,
      status: { notIn: ["DONE", "DROPPED"] },
      OR: [{ scheduledStart: { gt: windowStart, lte: now } }, { scheduledEnd: { gt: windowStart, lte: now } }, { scheduledStart: { lte: now }, scheduledEnd: { gt: now } }]
    },
    select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, domain: { select: { slug: true } } }
  });
  const alerts = alertsForWindow(
    tasks.flatMap((task) => (task.scheduledStart && task.scheduledEnd ? [{ id: task.id, title: task.title, domainSlug: task.domain.slug, scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd }] : [])),
    windowStart,
    now,
    { timeZone: settings.timeZone, quietStartMin: userSettings?.quietStartMin ?? 1290, quietEndMin: userSettings?.quietEndMin ?? 390 }
  );
  const already = new Set((await db.alertDelivery.findMany({ where: { key: { in: alerts.map((alert) => alert.key) } }, select: { key: true } })).map((row) => row.key));
  const pending = alerts.filter((alert) => !already.has(alert.key));
  const coachNudge = await nextCoachNudge(db, userId, now, settings.timeZone, userSettings?.quietStartMin ?? 1290, userSettings?.quietEndMin ?? 390, options.calendarLoader);
  if (options.dryRun) return { ok: true, dryRun: true, windowStart, wouldSend: pending.map(({ key, title }) => ({ key, title })), coach: coachNudge?.title ?? null, suppressedDuplicates: alerts.length - pending.length };

  const base = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").replace(/\/+$/, "");
  const send = options.send ?? sendPushover;
  let sent = 0;
  let failed = 0;
  for (const alert of pending) {
    // Claim the key first: a concurrent run hitting the same key fails here and skips.
    try {
      await db.alertDelivery.create({ data: { userId, key: alert.key, kind: alert.key.split(":")[0], status: "SENDING" } });
    } catch {
      continue;
    }
    const result = await send(alert, /^https:\/\//.test(base) ? `${base}/now` : null);
    if (result.ok) {
      sent++;
      await db.alertDelivery.update({ where: { key: alert.key }, data: { status: "SENT" } });
    } else {
      failed++;
      // Release the claim so the next run can retry this alert.
      await db.alertDelivery.delete({ where: { key: alert.key } }).catch(() => undefined);
    }
  }
  if (coachNudge && sent === 0) {
    let claimed = true;
    try {
      await db.alertDelivery.create({ data: { userId, key: coachNudge.key, kind: "coach", status: "SENDING" } });
    } catch {
      claimed = false;
    }
    if (claimed) {
      const result = await send(coachNudge, /^https:\/\//.test(base) ? `${base}/plan` : null);
      if (result.ok) {
        sent++;
        await db.alertDelivery.update({ where: { key: coachNudge.key }, data: { status: "SENT" } });
      } else {
        await db.alertDelivery.delete({ where: { key: coachNudge.key } }).catch(() => undefined);
      }
    }
  }
  await db.sourceSync.upsert({
    where: { userId_sourceSystem: { userId, sourceSystem: RUN_MARKER } },
    update: { status: failed ? "FAILING" : "OK", lastAttemptAt: now, ...(failed ? { lastError: "Some alerts failed" } : { lastSuccessAt: now, lastError: null }) },
    create: { userId, sourceSystem: RUN_MARKER, status: failed ? "FAILING" : "OK", lastAttemptAt: now, lastSuccessAt: failed ? null : now }
  });
  return { ok: failed === 0, sent, failed, sync, calendarSync };
}


// The Coach message worth a phone notification right now, if any (and not throttled).
export async function nextCoachNudge(
  db: PrismaClient,
  userId: string,
  now: Date,
  timeZone: string,
  quietStartMin: number,
  quietEndMin: number,
  calendarLoader: CalendarLoader = googleCalendarLoader()
) {
  if (inQuietHours(now, timeZone, quietStartMin, quietEndMin)) return null;
  const coach = await loadCoach(userId, db, calendarLoader, now).catch(() => null);
  if (!coachPushWorthy(coach)) return null;
  const key = `coach:${coach.key}`;
  const [already, lastHour, today] = await Promise.all([
    db.alertDelivery.findUnique({ where: { key }, select: { id: true } }),
    db.alertDelivery.count({ where: { userId, kind: "coach", sentAt: { gte: new Date(now.getTime() - 60 * 60_000) } } }),
    db.alertDelivery.count({ where: { userId, kind: "coach", sentAt: { gte: startOfZonedDay(now, timeZone) } } })
  ]);
  if (already || lastHour > 0 || today >= COACH_MAX_PER_DAY) return null;
  const title = coach.kind === "GAP" ? `Free until ${coach.until}` : coach.kind === "MORNING" ? "Plan your day?" : "Wrap up today?";
  return { key, title, message: coach.text, taskId: coach.kind === "GAP" ? coach.options[0]?.taskId ?? "" : "" };
}
