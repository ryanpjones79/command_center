// Block-change alerts for the Now screen (RyanOS v2).
//
// A cron calls GET /api/cron/now-alerts about every 5 minutes. Each run looks
// back to the previous successful run (capped at 30 minutes) so a missed run
// is caught up, and every alert has a dedupe key recorded in AlertDelivery so
// retries and overlapping runs never send it twice. Keys include the block's
// time, so a moved block alerts at its new time and a cancelled/done block
// never alerts. Kids/Family blocks get only their start ping; nothing pings
// during quiet hours or inside another protected block; ordinary feed
// arrivals and P&L never ping.

export type AlertBlock = {
  id: string;
  title: string;
  domainSlug: string;
  scheduledStart: Date;
  scheduledEnd: Date;
};

export type NowAlert = { key: string; title: string; message: string; taskId: string };

const QUIET_SLUGS = new Set(["family", "kids"]);
const PROTECTED_SLUGS = new Set(["family", "kids", "health"]);
export const MAX_ALERTS_PER_RUN = 4;
export const MAX_LOOKBACK_MS = 30 * 60_000;

function minutesBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

// minutes after local midnight for `value` in `timeZone`
function localMinutes(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(map.hour) * 60 + Number(map.minute);
}

export function inQuietHours(value: Date, timeZone: string, quietStartMin: number, quietEndMin: number) {
  const minutes = localMinutes(value, timeZone);
  return quietStartMin > quietEndMin ? minutes >= quietStartMin || minutes < quietEndMin : minutes >= quietStartMin && minutes < quietEndMin;
}

export function alertsForWindow(
  blocks: AlertBlock[],
  windowStart: Date,
  windowEnd: Date,
  options: { timeZone?: string; quietStartMin?: number; quietEndMin?: number } = {}
): NowAlert[] {
  const inWindow = (value: Date) => value > windowStart && value <= windowEnd;
  const timeZone = options.timeZone ?? "America/Los_Angeles";
  const quiet = (value: Date) =>
    options.quietStartMin !== undefined && options.quietEndMin !== undefined && inQuietHours(value, timeZone, options.quietStartMin, options.quietEndMin);
  // Don't interrupt protected time with another block's ping.
  const insideProtected = (at: Date, selfId: string) =>
    blocks.some((block) => block.id !== selfId && PROTECTED_SLUGS.has(block.domainSlug) && block.scheduledStart < at && block.scheduledEnd > at);

  const alerts: NowAlert[] = [];
  for (const block of blocks) {
    if (inWindow(block.scheduledEnd) && !QUIET_SLUGS.has(block.domainSlug) && !quiet(block.scheduledEnd) && !insideProtected(block.scheduledEnd, block.id)) {
      alerts.push({ key: `end:${block.id}:${block.scheduledEnd.toISOString()}`, title: `Time's up: ${block.title}`, message: "Done, 15 more, or move it? Tap to close it out.", taskId: block.id });
    }
  }
  for (const block of blocks) {
    if (inWindow(block.scheduledStart) && !quiet(block.scheduledStart) && !insideProtected(block.scheduledStart, block.id)) {
      alerts.push({ key: `start:${block.id}:${block.scheduledStart.toISOString()}`, title: `Now: ${block.title}`, message: `${minutesBetween(block.scheduledStart, block.scheduledEnd)} min block. Tap for the plan.`, taskId: block.id });
    }
  }
  return alerts.slice(0, MAX_ALERTS_PER_RUN);
}

export function alertWindowMinutes() {
  const raw = Number(process.env.NOW_ALERTS_WINDOW_MIN ?? 5);
  return Number.isFinite(raw) ? Math.min(30, Math.max(1, Math.round(raw))) : 5;
}

export async function sendPushover(alert: { title: string; message: string }, url: string | null, fetcher: typeof fetch = fetch) {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) return { ok: false, error: "Pushover keys are not set." };
  const body = new URLSearchParams({ token, user, title: alert.title.slice(0, 250), message: alert.message.slice(0, 1000) });
  if (url) {
    body.set("url", url);
    body.set("url_title", "Open in RyanOS");
  }
  try {
    const response = await fetcher("https://api.pushover.net/1/messages.json", { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    return response.ok ? { ok: true, error: null } : { ok: false, error: `Pushover HTTP ${response.status}` };
  } catch {
    return { ok: false, error: "Pushover did not respond." };
  }
}
