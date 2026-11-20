// Block-change alerts for the Now screen.
//
// A cron calls GET /api/cron/now-alerts every WINDOW minutes. Each run alerts
// on blocks that started or ended inside the last window, so a steady cadence
// sends each alert once without stored state. Kids/Family blocks get only the
// start alert, never the "done?" ping. Delivery is Pushover (the channel AP
// Trader already uses). Off unless FEATURE_NOW_ALERTS=true and the Pushover
// keys and CRON_SECRET are set.

export type AlertBlock = {
  title: string;
  domainSlug: string;
  scheduledStart: Date;
  scheduledEnd: Date;
};

export type NowAlert = { title: string; message: string };

const QUIET_SLUGS = new Set(["family", "kids"]);
export const MAX_ALERTS_PER_RUN = 4;

function minutesBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

export function alertsForWindow(blocks: AlertBlock[], windowStart: Date, windowEnd: Date): NowAlert[] {
  const inWindow = (value: Date) => value > windowStart && value <= windowEnd;
  const alerts: NowAlert[] = [];
  for (const block of blocks) {
    if (inWindow(block.scheduledEnd) && !QUIET_SLUGS.has(block.domainSlug)) {
      alerts.push({ title: `Time's up: ${block.title}`, message: "Done, 15 more, or skip? Tap to close it out." });
    }
  }
  for (const block of blocks) {
    if (inWindow(block.scheduledStart)) {
      alerts.push({ title: `Now: ${block.title}`, message: `${minutesBetween(block.scheduledStart, block.scheduledEnd)} min block. Tap for the plan.` });
    }
  }
  return alerts.slice(0, MAX_ALERTS_PER_RUN);
}

export function alertWindowMinutes() {
  const raw = Number(process.env.NOW_ALERTS_WINDOW_MIN ?? 5);
  return Number.isFinite(raw) ? Math.min(30, Math.max(1, Math.round(raw))) : 5;
}

export async function sendPushover(alert: NowAlert, url: string | null, fetcher: typeof fetch = fetch) {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) return { ok: false, error: "Pushover keys are not set." };
  const body = new URLSearchParams({ token, user, title: alert.title.slice(0, 250), message: alert.message.slice(0, 1000) });
  if (url) {
    body.set("url", url);
    body.set("url_title", "Open Now");
  }
  try {
    const response = await fetcher("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000)
    });
    return response.ok ? { ok: true, error: null } : { ok: false, error: `Pushover HTTP ${response.status}` };
  } catch {
    return { ok: false, error: "Pushover did not respond." };
  }
}
