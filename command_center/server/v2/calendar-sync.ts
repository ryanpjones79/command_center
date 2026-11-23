import type { PrismaClient } from "@prisma/client";
import { getGoogleCalendarClient, getGoogleConfigSnapshot } from "@/server/google-client";
import { RYANOS_TASK_PROPERTY } from "@/server/google-calendar-service";
import { recordSourceSync } from "@/server/v2/ingest";
import { addZonedDays, startOfZonedDay } from "@/lib/v2/zoned-time";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Two-way sync of RyanOS time blocks with Google Calendar (owner decision 2026-11-22).
//
// - Every scheduled RyanOS task becomes one Google event on GOOGLE_CALENDAR_ID, with a fixed event id derived
//   from the task id and a private "ryanosTaskId" property. Meetings and other events are never touched.
// - Moving or deleting that event in Google moves or unschedules the task in RyanOS; changing the task in
//   RyanOS updates the event. When both changed, the later edit wins (event.updated vs task.updatedAt).
// - Done tasks keep their event as a record of the day. Dropped or unscheduled tasks lose theirs.
// - Runs when the Plan page opens, after each change made there, and with the 5-minute cron.
// OFF unless FEATURE_GOOGLE_CALENDAR_WRITE=true; needs a Google grant with calendar.events
// (scripts/google-auth-bootstrap.mjs). Events are created private. Failures are recorded as source
// "GOOGLE_CALENDAR" and never block scheduling in RyanOS.

export const SYNC_SOURCE = "GOOGLE_CALENDAR";
const LOOKAHEAD_DAYS = 15;

export type GoogleBlock = { eventId: string; taskId: string; cancelled: boolean; start: Date | null; end: Date | null; summary: string; updated: Date };
export type BlockBody = { summary: string; description: string; start: Date; end: Date; taskId: string; timeZone: string };
export type GoogleBlockApi = {
  list(from: Date, to: Date): Promise<GoogleBlock[]>;
  upsert(eventId: string, body: BlockBody): Promise<void>;
  remove(eventId: string): Promise<void>;
};

export type SyncTask = {
  id: string; title: string; status: string; scheduledStart: Date | null; scheduledEnd: Date | null; updatedAt: Date;
  projectName: string | null;
};

export type SyncDecision =
  | { type: "NONE" }
  | { type: "PUSH" }
  | { type: "PULL"; start: Date; end: Date }
  | { type: "UNSCHEDULE" }
  | { type: "DELETE_EVENT" };

// Google event ids allow a-v and 0-9; hex of the task id fits and never changes.
export function eventIdFor(taskId: string) {
  return "r0" + Buffer.from(taskId, "utf8").toString("hex");
}

export function taskIdFromEventId(eventId: string) {
  if (!/^r0([0-9a-f]{2})+$/.test(eventId)) return null;
  return Buffer.from(eventId.slice(2), "hex").toString("utf8");
}

const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
const isActive = (task: SyncTask) => task.status !== "DONE" && task.status !== "DROPPED";
export const blockSummary = (task: SyncTask) => task.title.slice(0, 250);

export function decide(task: SyncTask | null, event: GoogleBlock | null): SyncDecision {
  const live = event && !event.cancelled && event.start && event.end ? event : null;
  if (!task) return live ? { type: "DELETE_EVENT" } : { type: "NONE" };
  const scheduled = Boolean(task.scheduledStart && task.scheduledEnd);
  const googleNewer = Boolean(event && event.updated.getTime() > task.updatedAt.getTime());
  if (task.status === "DONE") return { type: "NONE" };
  if (scheduled && isActive(task)) {
    if (!event) return { type: "PUSH" };
    if (!live) return googleNewer ? { type: "UNSCHEDULE" } : { type: "PUSH" };
    const timesMatch = same(live.start, task.scheduledStart) && same(live.end, task.scheduledEnd);
    if (!timesMatch) return googleNewer ? { type: "PULL", start: live.start as Date, end: live.end as Date } : { type: "PUSH" };
    return live.summary === blockSummary(task) ? { type: "NONE" } : { type: "PUSH" };
  }
  if (!live) return { type: "NONE" };
  if (isActive(task) && googleNewer) return { type: "PULL", start: live.start as Date, end: live.end as Date };
  return { type: "DELETE_EVENT" };
}

export function writeEnabled() {
  return process.env.FEATURE_GOOGLE_CALENDAR_WRITE === "true" && getGoogleConfigSnapshot().calendarEnabled;
}

type GoogleError = { code?: number; response?: { status?: number } };
const statusOf = (error: unknown) => (error as GoogleError)?.code ?? (error as GoogleError)?.response?.status;

export function googleBlockApi(): GoogleBlockApi {
  const calendar = getGoogleCalendarClient();
  const calendarId = getGoogleConfigSnapshot().calendarId;
  const toBody = (eventId: string, body: BlockBody) => ({
    id: eventId,
    summary: body.summary,
    description: body.description,
    start: { dateTime: body.start.toISOString(), timeZone: body.timeZone },
    end: { dateTime: body.end.toISOString(), timeZone: body.timeZone },
    status: "confirmed",
    visibility: "private",
    transparency: "opaque",
    extendedProperties: { private: { [RYANOS_TASK_PROPERTY]: body.taskId } }
  });
  return {
    async list(from, to) {
      const out: GoogleBlock[] = [];
      let pageToken: string | undefined;
      do {
        const response = await calendar.events.list({
          calendarId, timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, showDeleted: true,
          maxResults: 2500, pageToken
        });
        for (const item of response.data.items ?? []) {
          const taskId = item.extendedProperties?.private?.[RYANOS_TASK_PROPERTY] ?? (item.id ? taskIdFromEventId(item.id) : null);
          if (!item.id || !taskId || item.id !== eventIdFor(taskId)) continue;
          out.push({
            eventId: item.id, taskId, cancelled: item.status === "cancelled",
            start: item.start?.dateTime ? new Date(item.start.dateTime) : null, end: item.end?.dateTime ? new Date(item.end.dateTime) : null,
            summary: item.summary ?? "", updated: new Date(item.updated ?? 0)
          });
        }
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    },
    async upsert(eventId, body) {
      try {
        await calendar.events.patch({ calendarId, eventId, requestBody: toBody(eventId, body) });
      } catch (error) {
        if (statusOf(error) !== 404) throw error;
        await calendar.events.insert({ calendarId, requestBody: toBody(eventId, body) });
      }
    },
    async remove(eventId) {
      try {
        await calendar.events.delete({ calendarId, eventId });
      } catch (error) {
        if (![404, 410].includes(statusOf(error) ?? 0)) throw error;
      }
    }
  };
}

export type SyncResult = { enabled: boolean; ok: boolean; pushed: number; pulled: number; unscheduled: number; deleted: number; error?: string };

export async function syncCalendar(userId: string, db: PrismaClient, options: { api?: GoogleBlockApi; now?: Date; force?: boolean } = {}): Promise<SyncResult> {
  const empty = { pushed: 0, pulled: 0, unscheduled: 0, deleted: 0 };
  if (!options.force && !writeEnabled()) return { enabled: false, ok: true, ...empty };
  const now = options.now ?? new Date();
  const settings = await loadDaySettings(userId, db);
  const from = startOfZonedDay(now, settings.timeZone);
  const to = addZonedDays(from, LOOKAHEAD_DAYS, settings.timeZone);
  const counts = { ...empty };
  try {
    const api = options.api ?? googleBlockApi();
    const events = await api.list(from, to);
    const byTask = new Map(events.map((event) => [event.taskId, event]));
    const rows = await db.executionTask.findMany({
      where: { userId, OR: [{ scheduledStart: { gte: from, lt: to } }, { id: { in: [...byTask.keys()] } }] },
      select: { id: true, title: true, status: true, scheduledStart: true, scheduledEnd: true, updatedAt: true, project: { select: { name: true } } }
    });
    const tasks = new Map(rows.map((row) => [row.id, { ...row, projectName: row.project?.name ?? null }]));
    for (const taskId of new Set([...tasks.keys(), ...byTask.keys()])) {
      const task = tasks.get(taskId) ?? null;
      const event = byTask.get(taskId) ?? null;
      // Blocks scheduled before today are history; leave them alone.
      if (task?.scheduledStart && task.scheduledStart < from && !event) continue;
      const decision = decide(task, event);
      if (decision.type === "PUSH" && task?.scheduledStart && task.scheduledEnd) {
        await api.upsert(eventIdFor(task.id), {
          summary: blockSummary(task), taskId: task.id, start: task.scheduledStart, end: task.scheduledEnd, timeZone: settings.timeZone,
          description: ["Planned in RyanOS", task.projectName].filter(Boolean).join(" · ") + "\nMove or delete it here and RyanOS follows."
        });
        counts.pushed++;
      } else if (decision.type === "PULL" && task) {
        await db.executionTask.update({ where: { id: task.id }, data: { scheduledStart: decision.start, scheduledEnd: decision.end, remainingMinutes: Math.round((decision.end.getTime() - decision.start.getTime()) / 60_000) } });
        await db.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "SCHEDULED", detail: `Moved in Google Calendar to ${decision.start.toISOString()}` } });
        counts.pulled++;
      } else if (decision.type === "UNSCHEDULE" && task) {
        await db.executionTask.update({ where: { id: task.id }, data: { scheduledStart: null, scheduledEnd: null } });
        await db.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "UNSCHEDULED", detail: "Removed in Google Calendar" } });
        counts.unscheduled++;
      } else if (decision.type === "DELETE_EVENT" && event) {
        await api.remove(event.eventId);
        counts.deleted++;
      }
    }
    await recordSourceSync(userId, SYNC_SOURCE, true, null, db);
    return { enabled: true, ok: true, ...counts };
  } catch (error) {
    const status = statusOf(error);
    const message = status === 403 ? "Google refused the change: the Google sign-in needs calendar edit access." : status ? `Google Calendar answered ${status}.` : "Google Calendar could not be reached.";
    await recordSourceSync(userId, SYNC_SOURCE, false, message, db).catch(() => undefined);
    return { enabled: true, ok: false, ...counts, error: message };
  }
}
