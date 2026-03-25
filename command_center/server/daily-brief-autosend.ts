import { prisma } from "@/lib/prisma";
import { sendDailyBriefEmail } from "@/server/daily-brief-service";

type DailyBriefAutosendResult =
  | {
      ok: true;
      skipped: string;
      timeZone?: string;
      localTime?: string;
      dateKey?: string;
      sentAt?: Date | null;
    }
  | {
      ok: true;
      sent: true;
      dateKey: string;
      emailTo: string;
    }
  | {
      ok: false;
      sent: false;
      dateKey: string;
      error: string;
    };

export function readIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function getLocalTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10)
  };
}

export function shouldSendNow(now: Date) {
  const timeZone = process.env.DAILY_BRIEF_TIMEZONE || "America/Los_Angeles";
  const sendHour = readIntegerEnv("DAILY_BRIEF_SEND_HOUR", 6);
  const sendMinute = readIntegerEnv("DAILY_BRIEF_SEND_MINUTE", 30);
  const local = getLocalTimeParts(now, timeZone);

  return {
    timeZone,
    sendHour,
    sendMinute,
    local,
    dateKey: `${local.year}-${local.month}-${local.day}`,
    inWindow: local.hour === sendHour && local.minute >= sendMinute && local.minute < sendMinute + 15
  };
}

export async function runDailyBriefAutosend(now = new Date()): Promise<DailyBriefAutosendResult> {
  if (process.env.FEATURE_DAILY_BRIEF_AUTOSEND !== "true") {
    return { ok: true, skipped: "FEATURE_DAILY_BRIEF_AUTOSEND is false" };
  }

  const timing = shouldSendNow(now);

  if (!timing.inWindow) {
    return {
      ok: true,
      skipped: "Outside send window",
      timeZone: timing.timeZone,
      localTime: `${timing.local.year}-${timing.local.month}-${timing.local.day} ${String(timing.local.hour).padStart(2, "0")}:${String(timing.local.minute).padStart(2, "0")}`
    };
  }

  const existing = await prisma.dailyBriefDispatch.findUnique({
    where: { dateKey: timing.dateKey }
  });

  if (existing?.status === "SENT") {
    return {
      ok: true,
      skipped: "Already sent",
      dateKey: timing.dateKey,
      sentAt: existing.sentAt
    };
  }

  try {
    const brief = await sendDailyBriefEmail(now);

    await prisma.dailyBriefDispatch.upsert({
      where: { dateKey: timing.dateKey },
      update: {
        emailTo: brief.emailTo,
        status: "SENT",
        error: null,
        sentAt: new Date()
      },
      create: {
        dateKey: timing.dateKey,
        emailTo: brief.emailTo,
        status: "SENT",
        sentAt: new Date()
      }
    });

    return {
      ok: true,
      sent: true,
      dateKey: timing.dateKey,
      emailTo: brief.emailTo
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown daily brief send failure";

    await prisma.dailyBriefDispatch.upsert({
      where: { dateKey: timing.dateKey },
      update: {
        emailTo: process.env.GOOGLE_DAILY_BRIEF_EMAIL_TO || "",
        status: "FAILED",
        error: message
      },
      create: {
        dateKey: timing.dateKey,
        emailTo: process.env.GOOGLE_DAILY_BRIEF_EMAIL_TO || "",
        status: "FAILED",
        error: message
      }
    });

    return {
      ok: false,
      sent: false,
      dateKey: timing.dateKey,
      error: message
    };
  }
}
