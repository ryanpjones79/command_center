import type { PrismaClient } from "@prisma/client";
import { detectPhi } from "@/lib/execution-validation";
import { localClock, zonedParts, zonedToUtc } from "@/lib/v2/zoned-time";
import { parseQuickAdd, type QuickTarget } from "@/lib/v2/quick-add";
import { PROTECTED_SLUGS } from "@/server/v2/day";
import { loadDaySettings, lockUser, type CalendarLoader } from "@/server/v2/schedule-service";

// Changes made on the Plan screen: drag a task onto the calendar, move or resize a block, drag it back to the
// list, add a task in one line, or mark who a task is waiting on. Overlaps are allowed but reported, never
// resolved by silently moving something else.

const MIN_BLOCK = 5;
const MAX_BLOCK = 12 * 60;

export type BlockResult =
  | { ok: true; overlaps: string[]; start: Date | null; end: Date | null }
  | { ok: false; error: string };

export async function setBlock(
  userId: string,
  taskId: string,
  start: Date | null,
  end: Date | null,
  db: PrismaClient,
  calendarLoader: CalendarLoader
): Promise<BlockResult> {
  if ((start === null) !== (end === null)) return { ok: false, error: "A block needs a start and an end." };
  if (start && end) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, error: "That time isn't valid." };
    const minutes = (end.getTime() - start.getTime()) / 60_000;
    if (minutes < MIN_BLOCK || minutes > MAX_BLOCK) return { ok: false, error: `A block must be between ${MIN_BLOCK} minutes and 12 hours.` };
  }
  const meetings = start && end ? await calendarLoader(new Date(start.getTime() - 86_400_000), new Date(end.getTime() + 86_400_000)).catch(() => []) : [];
  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const task = await tx.executionTask.findFirst({ where: { id: taskId, userId, status: { notIn: ["DONE", "DROPPED"] } }, select: { id: true } });
    if (!task) return { ok: false as const, error: "That task is already done or gone." };
    const overlaps: string[] = [];
    if (start && end) {
      for (const meeting of meetings) if (meeting.start < end && meeting.end > start) overlaps.push(meeting.title);
      const others = await tx.executionTask.findMany({
        where: { userId, id: { not: taskId }, status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
        select: { title: true, domain: { select: { slug: true } } }
      });
      for (const other of others) overlaps.push(PROTECTED_SLUGS.has(other.domain.slug) ? `${other.title} (protected)` : other.title);
    }
    await tx.executionTask.update({
      where: { id: taskId },
      data: start && end
        ? { scheduledStart: start, scheduledEnd: end, remainingMinutes: Math.round((end.getTime() - start.getTime()) / 60_000), whenBucket: "TODAY" }
        : { scheduledStart: null, scheduledEnd: null }
    });
    await tx.executionTaskEvent.create({ data: { userId, taskId, type: start ? "SCHEDULED" : "UNSCHEDULED", detail: start ? `Plan: ${start.toISOString()}` : "Plan: back to list" } });
    return { ok: true as const, overlaps, start, end };
  });
}

export type QuickAddResult = { ok: true; taskId: string; message: string } | { ok: false; error: string };

// Choices made in the New task panel. Each one, when given, wins over shorthand typed in the title.
export type TaskChoices = {
  day?: string | null; // YYYY-MM-DD, local
  time?: string | null; // HH:MM, local; puts the task on the calendar (today if no day)
  minutes?: number | null;
  priority?: "MEDIUM" | "HIGH" | "CRITICAL" | null;
  waitingOn?: string | null;
};

function localDayParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

export async function quickAdd(
  userId: string,
  text: string,
  presetProjectId: string | null,
  db: PrismaClient,
  now = new Date(),
  choices: TaskChoices = {}
): Promise<QuickAddResult> {
  const line = text.trim().slice(0, 300);
  if (!line) return { ok: false, error: "Type the task first." };
  if (detectPhi(line).length > 0) return { ok: false, error: "Not saved: that looks like patient information (NO PHI)." };
  const settings = await loadDaySettings(userId, db);
  const [projects, domains] = await Promise.all([
    db.executionProject.findMany({ where: { userId, closedAt: null }, select: { id: true, name: true, domainId: true } }),
    db.executionDomain.findMany({ where: { userId }, select: { id: true, name: true, slug: true } })
  ]);
  const targets: QuickTarget[] = [
    ...projects.map((project) => ({ id: project.id, name: project.name, kind: "PROJECT" as const, domainId: project.domainId })),
    ...domains.map((domain) => ({ id: domain.id, name: domain.name, slug: domain.slug, kind: "AREA" as const, domainId: domain.id }))
  ];
  // The chosen project or area (project picker, #-suggestion, or a project's own add line). A #tag typed in the text still wins.
  const preset = presetProjectId ? targets.find((target) => target.id === presetProjectId) ?? null : null;
  const parsed = parseQuickAdd(line, targets, now, settings.timeZone, preset);
  if (!parsed.title) return { ok: false, error: "Add a few words saying what the task is." };
  const tz = settings.timeZone;
  const pickedDay = choices.day ? localDayParts(choices.day) : null;
  const pickedTime = choices.time && /^\d{2}:\d{2}$/.test(choices.time) ? choices.time.split(":").map(Number) : null;
  if (pickedTime) {
    const base = pickedDay ?? (() => { const today = zonedParts(now, tz); return { year: today.year, month: today.month, day: today.day }; })();
    parsed.start = zonedToUtc(base.year, base.month, base.day, pickedTime[0], pickedTime[1], tz);
    parsed.dueDate = null;
  } else if (pickedDay) {
    parsed.dueDate = new Date(zonedToUtc(pickedDay.year, pickedDay.month, pickedDay.day, 0, 0, tz).getTime() + 86_400_000 - 60_000);
    parsed.start = null;
  }
  if (choices.minutes && choices.minutes > 0) parsed.minutes = Math.min(8 * 60, Math.round(choices.minutes));
  if (choices.priority) parsed.priority = choices.priority;
  const who = choices.waitingOn?.trim().slice(0, 80);
  if (who) {
    if (detectPhi(who).length > 0) return { ok: false, error: "Not saved: that looks like patient information (NO PHI)." };
    parsed.waitingOn = who;
  }
  const domainId = parsed.domainId ?? domains.find((domain) => domain.slug === "admin")?.id ?? domains[0]?.id;
  if (!domainId) return { ok: false, error: "No areas exist yet." };
  const minutes = parsed.minutes ?? 30;
  const start = parsed.start;
  const created = await db.executionTask.create({
    data: {
      userId,
      domainId,
      projectId: parsed.projectId,
      title: parsed.title,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      waitingOn: parsed.waitingOn,
      status: parsed.waitingOn ? "WAITING" : "NOT_STARTED",
      whenBucket: parsed.waitingOn ? "WAITING" : start ? "TODAY" : "THIS_WEEK",
      remainingMinutes: minutes,
      scheduledStart: start,
      scheduledEnd: start ? new Date(start.getTime() + minutes * 60_000) : null,
      source: "Quick add"
    },
    select: { id: true }
  });
  await db.executionTaskEvent.create({ data: { userId, taskId: created.id, type: "ARRIVED", detail: "Quick add" } });
  const where = parsed.targetName ?? "your list";
  const parts = [
    `Added to ${where}`,
    parsed.dueDate ? `due ${parsed.dueDate.toLocaleDateString("en-US", { timeZone: settings.timeZone, weekday: "short", month: "short", day: "numeric" })}` : null,
    start ? `on the calendar at ${localClock(start, settings.timeZone)}` : null,
    parsed.waitingOn ? `waiting on ${parsed.waitingOn}` : null
  ].filter(Boolean);
  const note = parsed.unmatchedTag ? ` No project matched #${parsed.unmatchedTag}, so it went to ${where}.` : "";
  return { ok: true, taskId: created.id, message: parts.join(", ") + "." + note };
}

export async function setWaitingOn(userId: string, taskId: string, name: string | null, db: PrismaClient) {
  const who = name?.trim().slice(0, 80) || null;
  if (who && detectPhi(who).length > 0) return { ok: false as const, error: "Not saved: that looks like patient information (NO PHI)." };
  const task = await db.executionTask.findFirst({ where: { id: taskId, userId, status: { notIn: ["DONE", "DROPPED"] } }, select: { id: true } });
  if (!task) return { ok: false as const, error: "Task not found." };
  await db.executionTask.update({
    where: { id: taskId },
    data: who ? { waitingOn: who, status: "WAITING", whenBucket: "WAITING", scheduledStart: null, scheduledEnd: null } : { waitingOn: null, status: "NOT_STARTED", whenBucket: "THIS_WEEK" }
  });
  await db.executionTaskEvent.create({ data: { userId, taskId, type: who ? "WAITING" : "RESUMED", detail: who ? `Waiting on ${who}` : "No longer waiting" } });
  return { ok: true as const };
}
