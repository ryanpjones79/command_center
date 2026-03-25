import Link from "next/link";
import { sendDailyBriefEmailAction } from "@/app/daily-brief/actions";
import { PrintBrowserButton } from "@/components/execution/print-browser-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { getDailyBriefData } from "@/server/daily-brief-service";

type DailyBriefPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

export default async function DailyBriefPage({ searchParams }: DailyBriefPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const sent = firstParam(params.sent) === "1";
  const error = firstParam(params.error);
  const brief = await getDailyBriefData(new Date(), user.id);
  const sections = parseBriefSections(brief.briefText);

  return (
    <main className="space-y-6">
      <div className="app-no-print space-y-6">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Daily Brief</p>
            <h2 className="text-4xl font-semibold tracking-tight">Operator Brief</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Live Google Calendar, planning-sheet, and news inputs rendered through your Action Daily OS brief rules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/">Open Action Sheet</Link>
            </Button>
            <PrintBrowserButton />
            <form action={sendDailyBriefEmailAction}>
              <Button disabled={brief.status !== "ok" || !brief.emailTo} type="submit">
                Send Email
              </Button>
            </form>
          </div>
        </section>

        {(sent || error) && (
          <Card className={error ? "border-destructive" : ""}>
            <CardHeader>
              <CardTitle className="text-base">{error ? "Send Failed" : "Email Sent"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{error || `Daily Brief sent to ${brief.emailTo}.`}</p>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brief Status</CardTitle>
              <CardDescription>{brief.promptVersion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Status: {brief.status === "ok" ? "Ready" : "Missing inputs"}</p>
              <p>Calendar events: {brief.schedule.length}</p>
              <p>Derived work blocks: {brief.workBlocks.length}</p>
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
              {brief.missingInputs.length === 0 && brief.warnings.length === 0 && <p>No warnings.</p>}
              {brief.missingInputs.map((item) => (
                <p key={item}>- {item}</p>
              ))}
              {brief.warnings.map((item) => (
                <p key={item}>- {item}</p>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Plain-text brief body used for the email send.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 font-mono text-sm leading-6">
              {brief.briefText}
            </pre>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-3">
          {brief.newsTopics.map((topic) => (
            <Card key={topic.label}>
              <CardHeader>
                <CardTitle className="text-base">{topic.label}</CardTitle>
                <CardDescription>Latest full-story links</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topic.items.length === 0 && <p className="text-sm text-muted-foreground">No items returned.</p>}
                {topic.items.map((item) => (
                  <div className="rounded-lg border p-3" key={`${topic.label}-${item.link}`}>
                    <a
                      className="text-sm font-medium text-accent underline-offset-2 hover:underline"
                      href={item.link}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {item.title}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.source}
                      {item.publishedAt
                        ? ` - ${item.publishedAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                          })}`
                        : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>

      <section className="daily-brief-print-root print-only">
        <header className="daily-brief-print-header">
          <p className="daily-brief-print-kicker">Daily Brief</p>
          <h1 className="daily-brief-print-title">Operator Brief</h1>
          <p className="daily-brief-print-date">{brief.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
        </header>

        <div className="daily-brief-print-grid">
          {briefSectionOrder
            .filter((heading) => heading !== "NEWS WATCH")
            .map((heading) => {
              const items = (sections.get(heading) ?? []).filter((item) => !item.trim().startsWith("http"));
              if (items.length === 0) {
                return null;
              }

              return (
                <section className="daily-brief-print-card" key={heading}>
                  <h3>{heading}</h3>
                  <div className="daily-brief-print-list">
                    {items.map((item, index) => (
                      <p key={`${heading}-${index}`}>{item}</p>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>

        <section className="daily-brief-print-card daily-brief-print-news">
          <h3>NEWS WATCH</h3>
          <div className="daily-brief-print-news-grid">
            {brief.newsTopics.map((topic) => (
              <div key={topic.label}>
                <p className="daily-brief-print-news-topic">{topic.label}</p>
                <div className="daily-brief-print-list">
                  {topic.items.slice(0, 3).map((item, index) => (
                    <p key={`${topic.label}-${index}`}>
                      {index + 1}. {item.title} ({item.source})
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
