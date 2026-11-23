import { addZonedDays, atLocalMinutes, startOfZonedDay, zonedParts, zonedToUtc } from "@/lib/v2/zoned-time";

// One-line task entry. Plain text works; optional shorthand fills in the rest:
//   #name        project or area (best match on name; "#rykas", "#xmas", "#cchcs")
//   fri / tomorrow / today / 11/30 / nov 30      due that day
//   at 3pm / 3:30pm / 15:00                      put it on the calendar at that time (then the day is not a due date)
//   30m / 1h / 1.5h / 90min                      how long it takes
//   @Sam                                         waiting on Sam (shows under Waiting)
//   !  /  !!                                     high / critical priority
// Anything not understood stays in the title, so nothing typed is lost.

export type QuickTarget = { id: string; name: string; kind: "PROJECT" | "AREA"; domainId: string; slug?: string };

export type QuickTask = {
  title: string;
  projectId: string | null;
  domainId: string | null;
  targetName: string | null;
  unmatchedTag: string | null;
  dueDate: Date | null;
  start: Date | null;
  minutes: number | null;
  waitingOn: string | null;
  priority: "MEDIUM" | "HIGH" | "CRITICAL";
};

const WEEKDAY_WORDS: Record<string, number> = Object.fromEntries(
  [
    ["sun", "sunday"],
    ["mon", "monday"],
    ["tue", "tues", "tuesday"],
    ["wed", "weds", "wednesday"],
    ["thu", "thur", "thurs", "thursday"],
    ["fri", "friday"],
    ["sat", "saturday"]
  ].flatMap((names, index) => names.map((name) => [name, index]))
);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// Best project/area for a #tag: exact name, then name starting with the tag, then containing it.
// Projects win over areas on a tie; an unknown tag is reported, never guessed.
export function matchTarget(tag: string, targets: QuickTarget[]): QuickTarget | null {
  const key = squash(tag);
  if (!key) return null;
  const score = (target: QuickTarget) => {
    const names = [target.name, target.slug ?? "", ...target.name.split(/[:&/,-]/)].map(squash).filter(Boolean);
    if (names.some((name) => name === key)) return 3;
    if (names.some((name) => name.startsWith(key))) return 2;
    if (key.length >= 3 && names.some((name) => name.includes(key))) return 1;
    return 0;
  };
  const ranked = targets
    .map((target) => ({ target, score: score(target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (a.target.kind === b.target.kind ? a.target.name.length - b.target.name.length : a.target.kind === "PROJECT" ? -1 : 1));
  return ranked[0]?.target ?? null;
}

function endOfLocalDay(day: Date, timeZone: string) {
  return new Date(addZonedDays(startOfZonedDay(day, timeZone), 1, timeZone).getTime() - 60_000);
}

function parseDay(token: string, next: string | undefined, now: Date, timeZone: string): { day: Date; used: number } | null {
  const word = token.toLowerCase().replace(/[.,]$/, "");
  const today = startOfZonedDay(now, timeZone);
  if (word === "today" || word === "tonight") return { day: today, used: 1 };
  if (word === "tomorrow" || word === "tmr" || word === "tmrw") return { day: addZonedDays(today, 1, timeZone), used: 1 };
  const weekday = WEEKDAY_WORDS[word] ?? -1;
  if (weekday >= 0) {
    const current = zonedParts(now, timeZone).weekday;
    const ahead = (weekday - current + 7) % 7 || 7;
    return { day: addZonedDays(today, ahead, timeZone), used: 1 };
  }
  const parts = zonedParts(now, timeZone);
  const build = (month: number, dayOfMonth: number, year?: number) => {
    if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
    let y = year ?? parts.year;
    let value = zonedToUtc(y, month, dayOfMonth, 0, 0, timeZone);
    if (!year && value < today) value = zonedToUtc(++y, month, dayOfMonth, 0, 0, timeZone);
    return value;
  };
  const slash = word.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : undefined;
    const value = build(Number(slash[1]), Number(slash[2]), year);
    return value ? { day: value, used: 1 } : null;
  }
  const month = MONTHS.findIndex((name) => word.startsWith(name) && word.length <= 9);
  if (month >= 0 && next && /^\d{1,2}(st|nd|rd|th)?[,.]?$/i.test(next)) {
    const value = build(month + 1, Number.parseInt(next, 10));
    return value ? { day: value, used: 2 } : null;
  }
  return null;
}

function parseClock(token: string): number | null {
  const match = token.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (!meridiem && !match[2]) return null; // a bare number is not a time
  if (meridiem?.startsWith("p") && hours < 12) hours += 12;
  if (meridiem?.startsWith("a") && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseMinutes(token: string): number | null {
  const match = token.toLowerCase().match(/^(\d+(?:\.\d+)?)(m|min|mins|minutes|h|hr|hrs|hour|hours)$/);
  if (!match) return null;
  const value = Number(match[1]) * (match[2].startsWith("h") ? 60 : 1);
  return value >= 5 && value <= 720 ? Math.round(value) : null;
}

export function parseQuickAdd(text: string, targets: QuickTarget[], now: Date, timeZone: string, preset: QuickTarget | null = null): QuickTask {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  let target: QuickTarget | null = preset;
  let unmatchedTag: string | null = null;
  let day: Date | null = null;
  let clock: number | null = null;
  let minutes: number | null = null;
  let waitingOn: string | null = null;
  let priority: QuickTask["priority"] = "MEDIUM";

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (token.startsWith("#") && token.length > 1) {
      const found = matchTarget(token.slice(1), targets);
      if (found) target = found;
      else { unmatchedTag = token.slice(1); kept.push(token.slice(1)); }
      continue;
    }
    if (token.startsWith("@") && token.length > 1) { waitingOn = token.slice(1).replace(/[.,]$/, ""); continue; }
    if (/^!{1,3}$/.test(token)) { priority = token.length >= 2 ? "CRITICAL" : "HIGH"; continue; }
    const duration = parseMinutes(token);
    if (duration !== null) { minutes = duration; continue; }
    if (lower === "at" && tokens[index + 1] && parseClock(tokens[index + 1]) !== null) { clock = parseClock(tokens[++index]); continue; }
    const asClock = parseClock(token);
    if (asClock !== null && /[ap]m?$|:/i.test(token)) { clock = asClock; continue; }
    if (["by", "on", "due"].includes(lower) && tokens[index + 1]) {
      const parsed = parseDay(tokens[index + 1], tokens[index + 2], now, timeZone);
      if (parsed) { day = parsed.day; index += parsed.used; continue; }
    }
    const parsed = parseDay(token, tokens[index + 1], now, timeZone);
    if (parsed) { day = parsed.day; index += parsed.used - 1; continue; }
    kept.push(token);
  }

  const title = kept.join(" ").replace(/\s+([,.;:])/g, "$1").trim();
  const base = day ?? (clock !== null ? startOfZonedDay(now, timeZone) : null);
  let start = base && clock !== null ? atLocalMinutes(base, clock, timeZone) : null;
  if (start && !day && start < now) start = atLocalMinutes(addZonedDays(base as Date, 1, timeZone), clock as number, timeZone); // "at 9am" said in the evening means tomorrow
  return {
    title,
    projectId: target?.kind === "PROJECT" ? target.id : null,
    domainId: target?.domainId ?? null,
    targetName: target?.name ?? null,
    unmatchedTag,
    // With a time, the day says when it is on the calendar, not a deadline.
    dueDate: day && clock === null ? endOfLocalDay(day, timeZone) : null,
    start,
    minutes,
    waitingOn,
    priority
  };
}
