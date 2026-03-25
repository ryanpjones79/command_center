import { prisma } from "@/lib/prisma";
import { DAILY_BRIEF_PROMPT_ENHANCEMENTS, DAILY_BRIEF_PROMPT_VERSION } from "@/server/daily-brief-prompt";
import { getActionSheetData } from "@/server/execution-service";
import {
  deriveWorkBlocksFromEvents,
  formatCalendarEventLine,
  getTodaysCalendarEvents,
  type CalendarEvent,
  type WorkBlock
} from "@/server/google-calendar-service";
import { getGoogleConfigSnapshot, getGoogleGmailClient, getMissingGoogleConfigKeys } from "@/server/google-client";
import { getTodayPlanningRow, type DailyPlanningInputs } from "@/server/google-sheets-service";
import { getDailyBriefNews, type DailyNewsTopic } from "@/server/news-service";

export type DailyBriefStatus = "ok" | "missing";
type BriefExecutionTask = Awaited<ReturnType<typeof getActionSheetData>>["sections"]["today"][number];

type DailyBriefExecutionContext = {
  outcomeTasks: BriefExecutionTask[];
  quickStartTasks: BriefExecutionTask[];
  quickWinTasks: BriefExecutionTask[];
  blockedTitles: string[];
  overdueFollowUpTitles: string[];
  deferTitles: string[];
};

export type DailyBriefData = {
  status: DailyBriefStatus;
  briefText: string;
  emailText: string;
  date: Date;
  planning: DailyPlanningInputs | null;
  schedule: CalendarEvent[];
  workBlocks: WorkBlock[];
  newsTopics: DailyNewsTopic[];
  warnings: string[];
  missingInputs: string[];
  promptVersion: string;
  promptEnhancements: readonly string[];
  emailTo: string;
};

const briefSectionOrder = [
  "MISSION FOR TODAY",
  "MORNING LAUNCH",
  "QUICK START QUEUE",
  "TOP 3 OUTCOMES",
  "DECISION FILTER",
  "SCHEDULE SNAPSHOT",
  "BEST WORK BLOCKS",
  "RECOMMENDED PLAN",
  "QUICK WINS",
  "GRATITUDE + CONNECTION",
  "WATCHOUTS",
  "NEWS WATCH"
] as const;

function formatDateLine(value: Date) {
  return value.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

async function resolveDailyBriefUserId(userId?: string) {
  if (userId) {
    return userId;
  }

  const defaultEmail = process.env.DEFAULT_USER_EMAIL?.trim();
  if (defaultEmail) {
    const user = await prisma.user.findUnique({
      where: { email: defaultEmail },
      select: { id: true }
    });
    if (user) {
      return user.id;
    }
  }

  const fallbackUser = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  return fallbackUser?.id ?? null;
}

function sameOrBeforeDay(left: Date, right: Date) {
  return new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime() <=
    new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
}

function durationFitScore(estimatedDuration: string | null | undefined, minutes: number) {
  if (!estimatedDuration) {
    return 1;
  }

  switch (estimatedDuration) {
    case "UNDER_30_MIN":
      if (minutes <= 45) return 5;
      if (minutes <= 75) return 3;
      return 1;
    case "THIRTY_TO_SIXTY_MIN":
      if (minutes >= 30 && minutes <= 75) return 5;
      if (minutes >= 20 && minutes <= 100) return 3;
      return 1;
    case "ONE_TO_TWO_HOURS":
      if (minutes >= 60 && minutes <= 150) return 5;
      if (minutes >= 45 && minutes <= 180) return 3;
      return 1;
    case "TWO_HOURS_PLUS":
      if (minutes >= 120) return 6;
      if (minutes >= 90) return 2;
      return 0;
    default:
      return 1;
  }
}

function scoreTaskForWorkBlock(task: BriefExecutionTask, minutes: number, referenceDate: Date) {
  let score = durationFitScore(task.estimatedDuration, minutes);

  if (task.pinToTodayUntilDone) score += 2;
  if (task.project?.weeklyFocus === "TOP_3") score += 2;
  if (task.priority === "CRITICAL") score += 3;
  if (task.priority === "HIGH") score += 2;
  if (task.priority === "MEDIUM") score += 1;
  if (task.dueDate && sameOrBeforeDay(task.dueDate, referenceDate)) score += 2;

  return score;
}

function buildExecutionContext(actionSheetData: Awaited<ReturnType<typeof getActionSheetData>>): DailyBriefExecutionContext {
  const outcomeTasks = [...actionSheetData.sections.today, ...actionSheetData.sections.thisWeek]
    .filter((task) => !task.isBlocked)
    .slice(0, 8);
  const quickStartTasks = [
    ...actionSheetData.overdueFollowUps,
    ...actionSheetData.sections.today.filter(
      (task) =>
        task.estimatedDuration === "UNDER_30_MIN" || task.estimatedDuration === "THIRTY_TO_SIXTY_MIN"
    )
  ].slice(0, 6);
  const quickWinTasks = actionSheetData.sections.quickWins
    .filter((task) => task.whenBucket === "TODAY" || task.whenBucket === "THIS_WEEK")
    .slice(0, 6);

  return {
    outcomeTasks,
    quickStartTasks,
    quickWinTasks,
    blockedTitles: actionSheetData.blockedItems
      .map((item) => ("title" in item ? item.title : item.name))
      .filter(Boolean)
      .slice(0, 3),
    overdueFollowUpTitles: actionSheetData.overdueFollowUps.map((task) => task.title).slice(0, 3),
    deferTitles: actionSheetData.sections.parkingLot.map((task) => task.title).slice(0, 3)
  };
}

function mergeIntervals(events: CalendarEvent[]) {
  if (events.length === 0) {
    return [];
  }

  const sorted = [...events].sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged = [
    {
      start: sorted[0].start,
      end: sorted[0].end
    }
  ];

  for (const event of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (event.start.getTime() <= current.end.getTime()) {
      current.end = new Date(Math.max(current.end.getTime(), event.end.getTime()));
      continue;
    }

    merged.push({
      start: event.start,
      end: event.end
    });
  }

  return merged;
}

function summarizeSchedulePressure(schedule: CalendarEvent[], workBlocks: WorkBlock[]) {
  const mergedBusy = mergeIntervals(schedule);
  const busyMinutes = mergedBusy.reduce(
    (total, interval) => total + Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / 60000)),
    0
  );
  const overlapCount = schedule.reduce((count, event, index) => {
    const next = schedule[index + 1];
    if (!next) {
      return count;
    }

    return next.start.getTime() < event.end.getTime() ? count + 1 : count;
  }, 0);
  const longestBlockMinutes = workBlocks.reduce((max, block) => Math.max(max, block.minutes), 0);
  const meetingHeavy = schedule.length >= 5 || busyMinutes >= 240;
  const fragmented = workBlocks.length === 0 || longestBlockMinutes < 120 || overlapCount > 0;

  return {
    meetingHeavy,
    fragmented
  };
}

function chooseTopOutcomes(planning: DailyPlanningInputs, executionContext: DailyBriefExecutionContext | null) {
  return uniqueNonEmpty([
    planning.mustBeforeNoon,
    ...planning.topPriorities,
    ...(executionContext?.outcomeTasks.map((task) => task.title) ?? []),
    ...planning.quickWins
  ]).slice(0, 3);
}

function buildMission(planning: DailyPlanningInputs, outcomes: string[], meetingHeavy: boolean, fragmented: boolean) {
  const primary = outcomes[0] ?? planning.mustBeforeNoon ?? planning.topPriorities[0] ?? "Protect one meaningful win.";
  const secondary = outcomes[1];

  if (planning.mustBeforeNoon && primary.toLowerCase() !== planning.mustBeforeNoon.toLowerCase()) {
    return `Clear ${planning.mustBeforeNoon} before noon, then move ${primary}.`;
  }

  if (meetingHeavy || fragmented) {
    return secondary ? `Protect ${primary}. Treat ${secondary} as secondary if a second block opens.` : `Protect ${primary}.`;
  }

  return secondary ? `Move ${primary}, then ${secondary}.` : `Move ${primary}.`;
}

function buildMorningLaunch(planning: DailyPlanningInputs) {
  return uniqueNonEmpty([...planning.morningLaunch, planning.outlookSweep]).slice(0, 3);
}

function buildQuickStartQueue(planning: DailyPlanningInputs, executionContext: DailyBriefExecutionContext | null) {
  return uniqueNonEmpty([
    ...planning.quickStartQueue,
    ...(executionContext?.overdueFollowUpTitles ?? []),
    ...(executionContext?.quickStartTasks.map((task) => task.title) ?? [])
  ]).slice(0, 3);
}

function buildQuickWins(planning: DailyPlanningInputs, executionContext: DailyBriefExecutionContext | null) {
  return uniqueNonEmpty([
    ...planning.quickWins,
    ...(executionContext?.quickWinTasks.map((task) => task.title) ?? [])
  ]).slice(0, 3);
}

function buildWorkBlockLines(
  planning: DailyPlanningInputs,
  workBlocks: WorkBlock[],
  outcomes: string[],
  executionContext: DailyBriefExecutionContext | null,
  referenceDate: Date
) {
  if (planning.availableWorkBlocks.length > 0) {
    return planning.availableWorkBlocks.slice(0, 3).map((block, index) => {
      const target = executionContext?.outcomeTasks[index]?.title ?? outcomes[index];
      return target ? `${block} -> ${target}` : block;
    });
  }

  if (workBlocks.length === 0) {
    return ["No bounded work block available from the current schedule."];
  }

  const lines: string[] = [];
  let blockIndex = 0;
  const primary = outcomes[0];
  const secondary = outcomes[1];
  const tertiary = outcomes[2];
  const usedTitles = new Set<string>();

  const pickTaskForBlock = (block: WorkBlock) => {
    if (!executionContext) {
      return null;
    }

    const candidates = executionContext.outcomeTasks.filter((task) => !usedTitles.has(task.title));
    if (candidates.length === 0) {
      return null;
    }

    return [...candidates].sort((left, right) => {
      const scoreDiff =
        scoreTaskForWorkBlock(right, block.minutes, referenceDate) - scoreTaskForWorkBlock(left, block.minutes, referenceDate);
      if (scoreDiff !== 0) return scoreDiff;

      const dueDiff =
        (left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
      if (dueDiff !== 0) return dueDiff;

      return left.updatedAt.getTime() - right.updatedAt.getTime();
    })[0];
  };

  const preNoonBlock = workBlocks.find((block) => block.start.getHours() < 12);
  if (planning.mustBeforeNoon && preNoonBlock) {
    const followOn = primary && planning.mustBeforeNoon.toLowerCase() !== primary.toLowerCase() ? `, then ${primary}` : "";
    lines.push(`${preNoonBlock.label} -> ${planning.mustBeforeNoon} first${followOn}`);
    usedTitles.add(planning.mustBeforeNoon);
    blockIndex = workBlocks.findIndex((block) => block.label === preNoonBlock.label) + 1;
  }

  for (let index = blockIndex; index < workBlocks.length && lines.length < 3; index += 1) {
    const block = workBlocks[index];
    const matchedTask = pickTaskForBlock(block);
    if (matchedTask) {
      usedTitles.add(matchedTask.title);
      lines.push(`${block.label} -> ${matchedTask.title}`);
      continue;
    }

    const target = [primary, secondary, tertiary].find((item) => item && !usedTitles.has(item));
    if (target) {
      usedTitles.add(target);
      lines.push(`${block.label} -> ${target}`);
      continue;
    }

    lines.push(block.label);
  }

  return lines.slice(0, 3);
}

function buildRecommendedPlan(planning: DailyPlanningInputs, outcomes: string[], workBlockLines: string[]) {
  const first = planning.mustBeforeNoon
    ? `${planning.mustBeforeNoon} before noon${workBlockLines[0] ? ` via ${workBlockLines[0]}` : ""}.`
    : `${outcomes[0] ?? "Move the first priority"}${workBlockLines[0] ? ` in ${workBlockLines[0]}` : ""}.`;

  const thenTarget = outcomes.find(
    (item) =>
      item &&
      item.toLowerCase() !== planning.mustBeforeNoon.toLowerCase() &&
      item.toLowerCase() !== outcomes[0]?.toLowerCase()
  );
  const then = thenTarget
    ? `${thenTarget}${workBlockLines[1] ? ` in ${workBlockLines[1]}` : ""}.`
    : buildMorningLaunch(planning).join("; ") || "Run the launch checklist and protect the next open block.";

  const lastTarget = outcomes[2] ?? planning.quickWins[0] ?? planning.outlookSweep;
  const last = lastTarget
    ? `${lastTarget}${workBlockLines[2] ? ` in ${workBlockLines[2]}` : ""}.`
    : "Use short gaps for cleanup only.";

  return { first, then, last };
}

function buildWatchouts(
  outcomes: string[],
  schedule: CalendarEvent[],
  meetingHeavy: boolean,
  fragmented: boolean,
  executionContext: DailyBriefExecutionContext | null
) {
  const primary = outcomes[0] ?? "the main priority";
  const stretch = outcomes[2] ?? outcomes[1] ?? primary;
  const overlap = schedule.reduce((found, event, index) => {
    const next = schedule[index + 1];
    return found || Boolean(next && next.start.getTime() < event.end.getTime());
  }, false);
  const blockedLead = executionContext?.blockedTitles[0];
  const deferLead = executionContext?.deferTitles[0];

  return {
    avoid:
      meetingHeavy || fragmented
        ? `splitting the day across every priority; protect ${primary}${deferLead ? ` and leave ${deferLead} parked` : ""}.`
        : `starting with admin before ${primary}.`,
    doNotLet: overlap
      ? `overlapping morning commitments bleed into the first usable work block.`
      : blockedLead
        ? `${blockedLead} consume time before there is an unblock path.`
        : `${stretch} displace ${primary}.`
  };
}

function parseBriefSections(text: string) {
  const headings = new Set<string>(briefSectionOrder);
  const sections = new Map<string, string[]>();
  let currentHeading = "";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (headings.has(line)) {
      currentHeading = line;
      sections.set(line, []);
      continue;
    }

    if (line.startsWith("DAILY BRIEF") || line.startsWith("Date:")) {
      continue;
    }

    if (!currentHeading) {
      continue;
    }

    sections.get(currentHeading)?.push(line);
  }

  return sections;
}

function buildNewsLines(newsTopics: DailyNewsTopic[], includeLinks: boolean) {
  const lines = ["NEWS WATCH"];

  for (const topic of newsTopics) {
    lines.push(topic.label);
    for (const item of topic.items) {
      lines.push(`- ${item.title} (${item.source || "Source unavailable"})`);
      if (includeLinks) {
        lines.push(`  ${item.link}`);
      }
    }
  }

  return lines;
}

function buildMissingBrief(referenceDate: Date, missingInputs: string[]) {
  return [
    "DAILY BRIEF",
    `Date: ${formatDateLine(referenceDate)}`,
    "",
    "MISSING INPUTS",
    ...missingInputs.map((item) => `- ${item}`)
  ].join("\n");
}

function buildBriefText(
  referenceDate: Date,
  planning: DailyPlanningInputs,
  schedule: CalendarEvent[],
  workBlocks: WorkBlock[],
  newsTopics: DailyNewsTopic[],
  includeNewsLinks: boolean,
  executionContext: DailyBriefExecutionContext | null
) {
  const outcomes = chooseTopOutcomes(planning, executionContext);
  const scheduleSummary = summarizeSchedulePressure(schedule, workBlocks);
  const mission = buildMission(planning, outcomes, scheduleSummary.meetingHeavy, scheduleSummary.fragmented);
  const morningLaunch = buildMorningLaunch(planning);
  const quickStartQueue = buildQuickStartQueue(planning, executionContext);
  const quickWins = buildQuickWins(planning, executionContext);
  const workBlockLines = buildWorkBlockLines(planning, workBlocks, outcomes, executionContext, referenceDate);
  const plan = buildRecommendedPlan(planning, outcomes, workBlockLines);
  const watchouts = buildWatchouts(
    outcomes,
    schedule,
    scheduleSummary.meetingHeavy,
    scheduleSummary.fragmented,
    executionContext
  );
  const gratitude = planning.gratitude.trim() ? planning.gratitude.trim() : "Not filled.";
  const relationship = planning.relationshipConnection.trim()
    ? planning.relationshipConnection.trim()
    : "Not filled.";

  const lines = [
    "DAILY BRIEF",
    `Date: ${formatDateLine(referenceDate)}`,
    "",
    "MISSION FOR TODAY",
    `- ${mission}`,
    "",
    "MORNING LAUNCH",
    ...(morningLaunch.length > 0 ? morningLaunch.map((item) => `- ${item}`) : ["- No morning launch items provided."]),
    "",
    "QUICK START QUEUE",
    ...(quickStartQueue.length > 0 ? quickStartQueue.map((item) => `- ${item}`) : ["- No quick-start items provided."]),
    "",
    "TOP 3 OUTCOMES",
    ...(outcomes.length > 0 ? outcomes.map((item) => `- ${item}`) : ["- No top outcomes provided."]),
    "",
    "DECISION FILTER",
    "- Do Now -> urgent, short, high leverage, or blocking",
    "- Schedule -> real, but later; date/time-based; recurring",
    "- Project Task -> belongs to a larger initiative",
    "- Follow-Up -> waiting on someone else",
    "- Reference -> useful, no action",
    "",
    "SCHEDULE SNAPSHOT",
    ...(schedule.length > 0 ? schedule.map((event) => `- ${formatCalendarEventLine(event)}`) : ["- No calendar commitments found."]),
    "",
    "BEST WORK BLOCKS",
    ...(workBlockLines.length > 0 ? workBlockLines.map((item) => `- ${item}`) : ["- No bounded work block available."]),
    "",
    "RECOMMENDED PLAN",
    `- First: ${plan.first}`,
    `- Then: ${plan.then}`,
    `- Last: ${plan.last}`,
    "",
    "QUICK WINS",
    ...(quickWins.length > 0 ? quickWins.map((item) => `- ${item}`) : ["- No quick wins provided."]),
    "",
    "GRATITUDE + CONNECTION",
    `- ${gratitude}`,
    `- ${relationship}`,
    "",
    "WATCHOUTS",
    `- Avoid ${watchouts.avoid}`,
    `- Do not let ${watchouts.doNotLet}`,
    "",
    ...buildNewsLines(newsTopics, includeNewsLinks)
  ];

  return lines.join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeHref(value: string) {
  return value.startsWith("https://") || value.startsWith("http://") ? value : "#";
}

function renderSectionHtml(lines: string[]) {
  const items = lines.map((line) => (line.startsWith("- ") ? line.slice(2) : line)).filter(Boolean);
  if (items.length === 0) {
    return "";
  }

  return `<ul style="margin:0;padding-left:18px;">${items
    .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function buildDailyBriefHtml(brief: DailyBriefData) {
  const sections = parseBriefSections(brief.briefText);
  const cards = briefSectionOrder
    .filter((heading) => heading !== "NEWS WATCH")
    .map((heading) => {
      const lines = sections.get(heading) ?? [];
      if (lines.length === 0) {
        return "";
      }

      return `
        <section style="border:1px solid #d4d9e1;padding:14px 16px;margin:0 0 12px;">
          <h2 style="margin:0 0 10px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(heading)}</h2>
          ${renderSectionHtml(lines)}
        </section>
      `;
    })
    .join("");

  const newsHtml = brief.newsTopics
    .map((topic) => {
      const items = topic.items
        .slice(0, 3)
        .map(
          (item) => `
            <li style="margin:0 0 8px;">
              <a href="${escapeHtml(sanitizeHref(item.link))}" style="color:#0f4c81;text-decoration:none;font-weight:600;">${escapeHtml(item.title)}</a>
              <span style="color:#4b5563;"> (${escapeHtml(item.source || "Source unavailable")})</span>
            </li>
          `
        )
        .join("");

      if (!items) {
        return "";
      }

      return `
        <section style="border:1px solid #d4d9e1;padding:14px 16px;margin:0 0 12px;">
          <h3 style="margin:0 0 10px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(topic.label)}</h3>
          <ol style="margin:0;padding-left:18px;">
            ${items}
          </ol>
        </section>
      `;
    })
    .join("");

  return `
    <html>
      <body style="margin:0;padding:24px;background:#f5f7fb;color:#111827;font-family:IBM Plex Sans,Segoe UI,Arial,sans-serif;">
        <div style="max-width:780px;margin:0 auto;background:#ffffff;padding:24px;border:1px solid #d4d9e1;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#4b5563;">Daily Brief</p>
          <h1 style="margin:0 0 6px;font-size:28px;line-height:1.05;">Operator Brief</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">${escapeHtml(formatDateLine(brief.date))}</p>
          ${cards}
          <section style="border:1px solid #d4d9e1;padding:14px 16px;">
            <h2 style="margin:0 0 12px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">NEWS WATCH</h2>
            ${newsHtml || '<p style="margin:0;">No news items returned.</p>'}
          </section>
        </div>
      </body>
    </html>
  `;
}

export async function getDailyBriefData(referenceDate = new Date(), userId?: string): Promise<DailyBriefData> {
  const config = getGoogleConfigSnapshot();
  const warnings: string[] = [];
  const missingInputs: string[] = [];
  const missingConfig = getMissingGoogleConfigKeys();
  const resolvedUserId = await resolveDailyBriefUserId(userId);

  if (missingConfig.length > 0) {
    missingInputs.push(`Google configuration missing: ${missingConfig.join(", ")}`);
  }

  let planning: DailyPlanningInputs | null = null;
  let schedule: CalendarEvent[] = [];
  let workBlocks: WorkBlock[] = [];
  let newsTopics: DailyNewsTopic[] = [];
  let executionContext: DailyBriefExecutionContext | null = null;

  if (missingInputs.length === 0) {
    const [planningResult, scheduleResult, newsResult, actionSheetResult] = await Promise.allSettled([
      getTodayPlanningRow(referenceDate),
      getTodaysCalendarEvents(referenceDate),
      getDailyBriefNews(3),
      resolvedUserId ? getActionSheetData(resolvedUserId) : Promise.resolve(null)
    ]);

    if (planningResult.status === "fulfilled") {
      planning = planningResult.value;
      if (!planning) {
        missingInputs.push(`No planning row found for ${referenceDate.toISOString().slice(0, 10)} in ${config.sheetName}.`);
      }
    } else {
      missingInputs.push(
        `Planning row read failed: ${planningResult.reason instanceof Error ? planningResult.reason.message : String(planningResult.reason)}`
      );
    }

    if (scheduleResult.status === "fulfilled") {
      schedule = scheduleResult.value;
    } else {
      missingInputs.push(
        `Calendar read failed: ${scheduleResult.reason instanceof Error ? scheduleResult.reason.message : String(scheduleResult.reason)}`
      );
    }

    if (newsResult.status === "fulfilled") {
      newsTopics = newsResult.value;
    } else {
      warnings.push(
        `News read failed: ${newsResult.reason instanceof Error ? newsResult.reason.message : String(newsResult.reason)}`
      );
    }

    if (actionSheetResult.status === "fulfilled") {
      executionContext = actionSheetResult.value ? buildExecutionContext(actionSheetResult.value) : null;
      if (!resolvedUserId) {
        warnings.push("Action Sheet sync unavailable: no app user found.");
      }
    } else {
      warnings.push(
        `Action Sheet sync failed: ${actionSheetResult.reason instanceof Error ? actionSheetResult.reason.message : String(actionSheetResult.reason)}`
      );
    }
  }

  if (planning) {
    workBlocks =
      planning.availableWorkBlocks.length > 0 ? [] : deriveWorkBlocksFromEvents(schedule, referenceDate, planning.workdayWindow);
  }

  return {
    status: missingInputs.length > 0 || !planning ? "missing" : "ok",
    briefText:
      missingInputs.length > 0 || !planning
        ? buildMissingBrief(referenceDate, missingInputs)
        : buildBriefText(referenceDate, planning, schedule, workBlocks, newsTopics, false, executionContext),
    emailText:
      missingInputs.length > 0 || !planning
        ? buildMissingBrief(referenceDate, missingInputs)
        : buildBriefText(referenceDate, planning, schedule, workBlocks, newsTopics, true, executionContext),
    date: referenceDate,
    planning,
    schedule,
    workBlocks,
    newsTopics,
    warnings,
    missingInputs,
    promptVersion: DAILY_BRIEF_PROMPT_VERSION,
    promptEnhancements: DAILY_BRIEF_PROMPT_ENHANCEMENTS,
    emailTo: config.dailyBriefEmailTo
  };
}

function buildRawEmail(to: string, subject: string, textBody: string, htmlBody: string) {
  const boundary = `daily-brief-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return Buffer.from(
    [
      `To: ${to}`,
      "MIME-Version: 1.0",
      `Subject: ${subject}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      textBody,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      htmlBody,
      "",
      `--${boundary}--`
    ].join("\r\n")
  ).toString("base64url");
}

export async function sendDailyBriefEmail(referenceDate = new Date(), userId?: string) {
  const brief = await getDailyBriefData(referenceDate, userId);
  if (brief.status !== "ok") {
    throw new Error("Daily Brief is missing required inputs. Email send skipped.");
  }

  if (!brief.emailTo) {
    throw new Error("GOOGLE_DAILY_BRIEF_EMAIL_TO is not configured.");
  }

  const gmail = getGoogleGmailClient();
  const htmlBody = buildDailyBriefHtml(brief);
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildRawEmail(brief.emailTo, `Daily Brief - ${formatDateLine(referenceDate)}`, brief.emailText, htmlBody)
    }
  });

  return brief;
}
