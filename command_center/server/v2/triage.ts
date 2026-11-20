import type { PrismaClient } from "@prisma/client";
import { detectPhi } from "@/lib/execution-validation";
import type { OwnerActionArea } from "@/lib/owner-actions";
import { addZonedDays, atLocalMinutes } from "@/lib/v2/zoned-time";
import { AREA_DOMAIN_SLUG } from "@/server/now/planning";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Turning an item that needs judgment into a decided commitment. The task
// keeps its identity; only its meaning and plan change.

export const TRIAGE_DECISIONS = ["TODAY", "THIS_WEEK", "WAITING", "SOMEDAY", "REFERENCE", "DROP"] as const;
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number];

export type TriageInput = {
  decision: TriageDecision;
  title?: string | null; // the action, e.g. "Return permission slip"
  area?: OwnerActionArea | null;
  dueDate?: string | null; // YYYY-MM-DD: when the ACTION must be done
  eventDate?: string | null; // YYYY-MM-DD: the related event (kept as context)
  waitingOn?: string | null;
  followUpDate?: string | null; // YYYY-MM-DD
};

const isDay = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export async function triageItem(userId: string, taskId: string, input: TriageInput, db: PrismaClient, now = new Date()) {
  const settings = await loadDaySettings(userId, db);
  const task = await db.executionTask.findFirst({ where: { id: taskId, userId }, select: { id: true, title: true, note: true, domainId: true } });
  if (!task) return { ok: false as const, error: "Item not found." };
  const title = (input.title ?? "").trim().slice(0, 200) || task.title;
  if (detectPhi(title).length > 0) return { ok: false as const, error: "Not saved: looks like patient information (NO PHI)." };
  const localDay = (value: string, minutes: number) => atLocalMinutes(new Date(`${value}T12:00:00Z`), minutes, settings.timeZone);
  const due = isDay(input.dueDate) ? localDay(input.dueDate, settings.workdayEndMin) : undefined;
  if (due && due < now) return { ok: false as const, error: "That due date has passed. Pick today or later, or drop it." };

  let domainId = task.domainId;
  if (input.area) {
    const domain = await db.executionDomain.findFirst({ where: { userId, slug: AREA_DOMAIN_SLUG[input.area] }, select: { id: true } });
    if (domain) domainId = domain.id;
  }
  const eventNote = isDay(input.eventDate) ? `Event: ${input.eventDate}` : null;
  const note = [task.note, eventNote].filter(Boolean).join("\n") || null;
  const base = { title, domainId, note, needsJudgment: false, dueDate: due };
  const morning = (days: number) => atLocalMinutes(addZonedDays(now, days, settings.timeZone), settings.workdayStartMin, settings.timeZone);

  if (input.decision === "REFERENCE") {
    await db.$transaction([
      db.parkedIdea.create({ data: { userId, idea: [title, task.note].filter(Boolean).join(" — ").slice(0, 1000), lane: input.area ?? "PERSONAL", status: "note" } }),
      db.executionTask.update({ where: { id: task.id }, data: { ...base, status: "DROPPED" } }),
      db.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "KEPT_AS_REFERENCE" } })
    ]);
    return { ok: true as const, error: null };
  }

  const plan =
    input.decision === "TODAY"
      ? { whenBucket: "TODAY" as const }
      : input.decision === "THIS_WEEK"
        ? { whenBucket: "THIS_WEEK" as const }
        : input.decision === "WAITING"
          ? { status: "WAITING" as const, whenBucket: "WAITING" as const, waitingOn: (input.waitingOn ?? "").slice(0, 200) || "Someone else", followUpDate: isDay(input.followUpDate) ? localDay(input.followUpDate, settings.workdayStartMin) : morning(3) }
          : input.decision === "SOMEDAY"
            ? { whenBucket: "PARKING_LOT" as const, followUpDate: morning(30) }
            : { status: "DROPPED" as const };
  await db.executionTask.update({ where: { id: task.id }, data: { ...base, ...plan } });
  await db.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "TRIAGED", detail: input.decision } });
  return { ok: true as const, error: null };
}
