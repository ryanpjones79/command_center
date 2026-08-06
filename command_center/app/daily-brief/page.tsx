import Link from "next/link";
import { sendDailyBriefEmailAction } from "@/app/daily-brief/actions";
import { PrintBrowserButton } from "@/components/execution/print-browser-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import {
  getDailyBriefData,
  getDailyBriefReferenceDate
} from "@/server/daily-brief-service";

type DailyBriefPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const briefSectionOrder = [
  "READ",
  "MISSION FOR TODAY",
  "MORNING LAUNCH",
  "MEAL PLAN",
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

const noCleanWorkBlockLine =
  "No clean work block. Use short execution windows.";

type PrintSection = {
  className?: string;
  lines: string[];
  title: string;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function stripBullet(line: string) {
  return line.replace(/^-\s*/, "").trim();
}

function normalizePrintLine(line: string) {
  const stripped = stripBullet(line);
  if (
    stripped.includes("No bounded work block available") ||
    stripped.includes("No clean work block. Use short execution windows")
  ) {
    return noCleanWorkBlockLine;
  }

  return stripped;
}

function getSectionLines(
  sections: Map<string, string[]>,
  heading: string,
  limit?: number
) {
  const lines = (sections.get(heading) ?? [])
    .filter((item) => !item.trim().startsWith("http"))
    .map(normalizePrintLine)
    .filter(Boolean);

  return typeof limit === "number" ? lines.slice(0, limit) : lines;
}

function getExactlyThree(lines: string[]) {
  const exact = lines.slice(0, 3);
  while (exact.length < 3) {
    exact.push("[ ]");
  }

  return exact;
}

function buildPrintSections(sections: Map<string, string[]>): PrintSection[] {
  const read = getSectionLines(sections, "READ", 3);
  const mission = getSectionLines(sections, "MISSION FOR TODAY", 1);
  const schedule = getSectionLines(sections, "SCHEDULE SNAPSHOT");
  const workBlocks = getSectionLines(sections, "BEST WORK BLOCKS", 2);
  const recommendedPlan = getSectionLines(sections, "RECOMMENDED PLAN", 3);
  const hasNoCleanBlock = workBlocks.some(
    (line) => line === noCleanWorkBlockLine
  );
  const planOfAttack = [
    ...(hasNoCleanBlock ? [noCleanWorkBlockLine] : workBlocks),
    ...recommendedPlan
  ].slice(0, 4);
  const quickWins = getSectionLines(sections, "QUICK WINS", 2);
  const watchouts = getSectionLines(sections, "WATCHOUTS", 2);

  return [
    {
      title: "Read",
      lines:
        read.length > 0
          ? read.map((line) =>
              line
                .replace("Current reading: ", "")
                .replace("Theme: ", "")
                .replace("Instruction: ", "")
            )
          : ["Read from the physical book. Write one line."],
      className: "daily-brief-print-card-wide"
    },
    {
      title: "Mission for Today",
      lines: mission.length > 0 ? mission : ["[ ]"],
      className: "daily-brief-print-card-wide"
    },
    {
      title: "Schedule Snapshot",
      lines:
        schedule.length > 0 ? schedule : ["No calendar commitments found."],
      className: "daily-brief-print-card-wide"
    },
    {
      title: "Plan of Attack",
      lines: planOfAttack.length > 0 ? planOfAttack : [noCleanWorkBlockLine],
      className: "daily-brief-print-card-wide"
    },
    {
      title: "Right Thing Easy Setup",
      lines: [
        "Health: water, protein, shoes visible",
        "Focus: pick one money/visibility move",
        "Friction: remove one blocker before starting"
      ]
    },
    {
      title: "Default Food Plan",
      lines: [
        "Shake / beef or chicken bowl / chicken + rice-potato / yogurt or jerky"
      ]
    },
    {
      title: "Today's Top 3",
      lines: getExactlyThree(getSectionLines(sections, "TOP 3 OUTCOMES"))
    },
    {
      title: "Quick Wins",
      lines: quickWins.length > 0 ? quickWins : ["[ ]"]
    },
    {
      title: "Fallback If Day Gets Messy",
      lines: [
        "Protein first. Walk 20 minutes. Complete one business money/visibility move."
      ]
    },
    {
      title: "Watchouts",
      lines: watchouts.length > 0 ? watchouts : ["[ ]"]
    },
    {
      title: "Scorecard",
      lines: [
        "[ ] Protein",
        "[ ] Movement",
        "[ ] CCHCS",
        "[ ] Rykas",
        "[ ] SignalCare"
      ]
    }
  ];
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

export default async function DailyBriefPage({
  searchParams
}: DailyBriefPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const sent = firstParam(params.sent) === "1";
  const error = firstParam(params.error);
  const brief = await getDailyBriefData(getDailyBriefReferenceDate(), user.id);
  const sections = parseBriefSections(brief.briefText);
  const printSections = buildPrintSections(sections);

  return (
    <main className="space-y-6">
      <div className="app-no-print space-y-6">
        <section className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">
              Daily Brief
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Operator Brief
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Live Google Calendar, RyanOS app inputs, and news rendered
              through your Action Daily OS brief rules.
            </p>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <Link href="/dashboard">Open Action Sheet</Link>
            </Button>
            <PrintBrowserButton />
            <form action={sendDailyBriefEmailAction}>
              <Button
                className="w-full sm:w-auto"
                disabled={brief.status !== "ok" || !brief.emailTo}
                type="submit"
              >
                Send Email
              </Button>
            </form>
          </div>
        </section>

        {(sent || error) && (
          <Card className={error ? "border-destructive" : ""}>
            <CardHeader>
              <CardTitle className="text-base">
                {error ? "Send Failed" : "Email Sent"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{error || `Daily Brief sent to ${brief.emailTo}.`}</p>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brief Status</CardTitle>
              <CardDescription>{brief.promptVersion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Status: {brief.status === "ok" ? "Ready" : "Missing inputs"}
              </p>
              <p>Calendar events: {brief.schedule.length}</p>
              <p>
                Work blocks:{" "}
                {brief.planning?.scheduledWorkBlocks.length ||
                  brief.workBlocks.length}
              </p>
              <p>News topics: {brief.newsTopics.length}</p>
              <p>Email target: {brief.emailTo || "Not configured"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prompt Enhancements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {brief.promptEnhancements.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Warnings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {brief.missingInputs.length === 0 &&
                brief.warnings.length === 0 && <p>No warnings.</p>}
              {brief.missingInputs.map((item) => (
                <p key={item}>- {item}</p>
              ))}
              {brief.warnings.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="overflow-hidden rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              Plain-text brief body used for the email send.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[68vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-5 sm:p-4 sm:text-sm sm:leading-6">
              {brief.briefText}
            </pre>
          </CardContent>
        </Card>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">News Watch</CardTitle>
            <CardDescription>
              Optional. Read only after today's execution tasks are complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-3">
            {brief.newsTopics.map((topic) => (
              <section className="rounded-lg border p-3" key={topic.label}>
                <h3 className="text-sm font-semibold">{topic.label}</h3>
                <div className="mt-2 space-y-2">
                  {topic.items.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No items returned.
                    </p>
                  )}
                  {topic.items.slice(0, 3).map((item) => (
                    <div key={`${topic.label}-${item.link}`}>
                      <a
                        className="line-clamp-2 text-xs font-medium text-accent underline-offset-2 hover:underline"
                        href={item.link}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.title}
                      </a>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.source || "Source unavailable"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="daily-brief-print-root print-only">
        <header className="daily-brief-print-header">
          <p className="daily-brief-print-kicker">Daily Brief</p>
          <h1 className="daily-brief-print-title">Operator Brief</h1>
          <p className="daily-brief-print-date">
            {brief.date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric"
            })}
          </p>
        </header>

        <div className="daily-brief-print-grid">
          {printSections.map((section) => (
            <section
              className={`daily-brief-print-card ${section.className ?? ""}`}
              key={section.title}
            >
              <h3>{section.title}</h3>
              <div className="daily-brief-print-list">
                {section.lines.map((item, index) => (
                  <p key={`${section.title}-${index}`}>{item}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
