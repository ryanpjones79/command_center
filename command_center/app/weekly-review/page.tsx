import Link from "next/link";
import {
  beginPaperReflectionAction,
  beginWeeklyResetAction,
  completePaperReflectionAction,
  completeWeeklyResetAction,
  markNotebookProcessedAction,
  markWeeklyGuideGeneratedAction,
  saveNextWeekAction,
  savePeopleIntentionsAction,
  skipPaperReflectionAction
} from "@/app/review/weekly-reset/actions";
import { PrintBrowserButton } from "@/components/execution/print-browser-button";
import { ProjectControl, DecisionButtons } from "@/components/review/project-control";
import { SubmitButton } from "@/components/execution/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNotebookTitle } from "@/lib/notebook-format";
import { requireUser } from "@/lib/session";
import {
  getGuidedWeeklyResetData,
  getWeeklyResetStepStatus,
  summarizeWeeklyHealthTrend,
  weeklyHealthMetricTargets,
  weeklyThemeExamples
} from "@/server/review-service";

type WeeklyReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const steps = [
  { key: "welcome", label: "Welcome" },
  { key: "paper", label: "Paper Reflection" },
  { key: "notebook", label: "Notebook Processing" },
  { key: "project-control", label: "Project Control" },
  { key: "decisions", label: "Decisions" },
  { key: "next-week", label: "Next Week" },
  { key: "people", label: "People" },
  { key: "printable", label: "Printable Week" },
  { key: "complete", label: "Complete" }
] as const;

type StepKey = (typeof steps)[number]["key"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveStep(value: string | undefined): StepKey {
  return steps.some((step) => step.key === value) ? (value as StepKey) : "welcome";
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatWeek(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatShortWeek(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysAgo(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() - days);
  return copy;
}

function StepShell({
  eyebrow,
  title,
  copy,
  children
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border bg-card/90 p-5 shadow-sm sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{eyebrow}</p>
      <h3 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{copy}</p>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function StepNav({ activeStep }: { activeStep: StepKey }) {
  return (
    <nav aria-label="Weekly reset steps" className="app-no-print flex gap-2 overflow-x-auto pb-1">
      {steps.map((step, index) => (
        <Link
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
            activeStep === step.key ? "border-primary bg-primary/15 text-primary" : "border-border bg-card/70 text-muted-foreground"
          }`}
          href={`/weekly-review?step=${step.key}`}
          key={step.key}
        >
          {index + 1}. {step.label}
        </Link>
      ))}
    </nav>
  );
}

function StaleDecisionStep({
  projects,
  outcomes
}: {
  projects: Awaited<ReturnType<typeof getGuidedWeeklyResetData>>["review"]["projects"];
  outcomes: Awaited<ReturnType<typeof getGuidedWeeklyResetData>>["outcomes"];
}) {
  const staleCutoff = daysAgo(startOfDay(new Date()), 7);
  const staleProjects = projects.filter(
    (project) =>
      project.activeStatus !== "COMPLETED" &&
      (project.lastReviewedAt ?? project.updatedAt) < staleCutoff
  );
  const staleTasks = projects.flatMap((project) =>
    project.tasks
      .filter((task) => task.updatedAt < staleCutoff)
      .map((task) => ({ ...task, parentProjectName: project.name }))
  );

  if (staleProjects.length === 0 && staleTasks.length === 0) {
    return (
      <Card className="border-dashed bg-card/70">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No stale project or task decisions are waiting. Continue to choosing the next week.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {staleProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects Needing A Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {staleProjects.map((project) => (
              <div className="rounded-xl border bg-background/45 p-3" key={project.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.domain.name}</p>
                  </div>
                  <DecisionButtons id={project.id} kind="project" selected={outcomes.staleDecisions?.[`project:${project.id}`]} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {staleTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks Needing A Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {staleTasks.map((task) => (
              <div className="rounded-xl border bg-background/45 p-3" key={task.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.parentProjectName}</p>
                  </div>
                  <DecisionButtons id={task.id} kind="task" selected={outcomes.staleDecisions?.[`task:${task.id}`]} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default async function WeeklyReviewPage({ searchParams }: WeeklyReviewPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const activeStep = resolveStep(firstParam(params.step));
  const data = await getGuidedWeeklyResetData(user.id);
  const status = getWeeklyResetStepStatus(data.reset);
  const topThreeIds =
    data.outcomes.topThreeProjectIds ??
    data.review.projects.filter((project) => project.weeklyFocus === "TOP_3").map((project) => project.id);
  const peopleValue = data.outcomes.peopleIntentions?.join("\n") ?? "";
  const currentSeason = data.workspace.seasons.find((season) => season.isCurrent) ?? null;
  const healthMetrics = data.outcomes.healthMetrics ?? {};
  const calendarPrep = data.outcomes.calendarPrep ?? {};

  return (
    <main className="space-y-6">
      <section className="app-no-print rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Review</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight">Weekly Reset</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Reflect on paper first. Reconcile digitally second.
            </p>
          </div>
          <Badge variant={status.complete ? "default" : "outline"}>
            Week of {formatWeek(data.reset.weekOf)}
          </Badge>
        </div>
      </section>

      <StepNav activeStep={activeStep} />

      <div className="app-no-print">
        {activeStep === "welcome" && (
          <StepShell
            copy="Close last week. Choose the next one."
            eyebrow="10-20 minutes"
            title="Weekly Reset"
          >
            <div className="flex flex-wrap gap-3">
              <form action={beginWeeklyResetAction}>
                <SubmitButton className="h-12 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground" pendingLabel="Starting..." type="submit">
                  Begin Weekly Reset
                </SubmitButton>
              </form>
              <Button asChild className="h-12 rounded-full px-7" variant="outline">
                <Link href="/weekly-review?step=project-control">Open Project Control</Link>
              </Button>
            </div>
          </StepShell>
        )}

        {activeStep === "paper" && (
          <StepShell
            copy="Spend a few quiet minutes reflecting before opening your projects."
            eyebrow="Step 2"
            title="Take your notebook."
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="bg-background/35">
                <CardContent className="pt-6">
                  <ul className="grid gap-3 text-base">
                    <li>What gave me energy?</li>
                    <li>What created noise?</li>
                    <li>What did I avoid?</li>
                    <li>What moved forward?</li>
                    <li>What did I learn?</li>
                    <li>Who needs more of me?</li>
                    <li>What notebook pages deserve another look?</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <p className="text-sm text-muted-foreground">
                    Reflection text stays in the notebook. RyanOS records only whether the paper step happened.
                  </p>
                  <div className="grid gap-2">
                    <form action={beginPaperReflectionAction}>
                      <SubmitButton className="w-full" pendingLabel="Recording..." type="submit">
                        Begin Reflection
                      </SubmitButton>
                    </form>
                    <form action={completePaperReflectionAction}>
                      <SubmitButton className="w-full rounded-md border border-border bg-background px-4 py-2" pendingLabel="Continuing..." type="submit">
                        Continue
                      </SubmitButton>
                    </form>
                    <form action={skipPaperReflectionAction}>
                      <SubmitButton className="w-full rounded-md px-4 py-2 text-muted-foreground" pendingLabel="Skipping..." type="submit">
                        Skip for now
                      </SubmitButton>
                    </form>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Started: {formatDate(data.reset.paperReflectionStartedAt)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </StepShell>
        )}

        {activeStep === "notebook" && (
          <StepShell
            copy="Turn only the useful paper artifacts into the right kind of RyanOS reference."
            eyebrow="Step 3"
            title="Process your notebook."
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="bg-background/35">
                <CardContent className="space-y-4 pt-6">
                  <p className="text-sm font-medium">Does anything deserve:</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {["A commitment?", "A project?", "A parked idea?", "A reference only?"].map((question) => (
                      <div className="rounded-xl border bg-card/70 p-4 text-sm" key={question}>
                        {question}
                      </div>
                    ))}
                  </div>
                  {data.notebookEntries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Indexed this week
                      </p>
                      <div className="mt-2 space-y-2">
                        {data.notebookEntries.map((entry) => (
                          <div className="rounded-lg border bg-card/70 p-3 text-sm" key={entry.id}>
                            <p className="font-medium">{entry.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatNotebookTitle(entry.notebook)} / Page {entry.pageNumber}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/library/notebooks">Notebook Index</Link>
                  </Button>
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/tasks?whenBucket=PARKING_LOT">Parked Ideas</Link>
                  </Button>
                  <Button asChild className="w-full" variant="outline">
                    <Link href="/projects">Projects</Link>
                  </Button>
                  <form action={markNotebookProcessedAction}>
                    <SubmitButton className="mt-3 w-full" pendingLabel="Recording..." type="submit">
                      Notebook Processed
                    </SubmitButton>
                  </form>
                  <p className="text-xs text-muted-foreground">
                    Processed: {formatDate(data.reset.notebookProcessedAt)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </StepShell>
        )}

        {activeStep === "project-control" && (
          <StepShell
            copy="Open the project control surface only after the notebook has had a first pass."
            eyebrow="Step 4"
            title="Project Control"
          >
            <details className="rounded-2xl border bg-background/30 p-4" open>
              <summary className="cursor-pointer text-base font-semibold">Project Control Foundation</summary>
              <div className="mt-5">
                <ProjectControl review={data.review} workspace={data.workspace} outcomes={data.outcomes} />
              </div>
            </details>
            <div className="mt-5 flex justify-end">
              <Button asChild>
                <Link href="/weekly-review?step=decisions">Continue to Decisions</Link>
              </Button>
            </div>
          </StepShell>
        )}

        {activeStep === "decisions" && (
          <StepShell
            copy="For each item that has gone quiet, decide what relationship it has to the coming week."
            eyebrow="Step 5"
            title="Decisions"
          >
            <StaleDecisionStep projects={data.review.projects} outcomes={data.outcomes} />
            <div className="mt-5 flex justify-end">
              <Button asChild>
                <Link href="/weekly-review?step=next-week">Continue to Next Week</Link>
              </Button>
            </div>
          </StepShell>
        )}

        {activeStep === "next-week" && (
          <StepShell
            copy="Choose the next week's operating emphasis and the projects that deserve the most attention."
            eyebrow="Step 6"
            title="Next Week"
          >
            <form action={saveNextWeekAction} className="grid gap-5">
              <Card className="bg-background/35">
                <CardContent className="border-b pt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Current Season
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {currentSeason?.title ?? "No current season selected"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Does this week's work support your current season?
                  </p>
                </CardContent>
                <CardHeader>
                  <CardTitle className="text-base">Top 3 Projects</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {data.review.projects.map((project) => (
                    <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-card/70 p-3 text-sm" key={project.id}>
                      <input
                        className="h-4 w-4"
                        defaultChecked={topThreeIds.includes(project.id)}
                        name="topThreeProjectIds"
                        type="checkbox"
                        value={project.id}
                      />
                      <span>
                        {project.name}
                        <span className="block text-xs text-muted-foreground">{project.domain.name}</span>
                      </span>
                    </label>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-background/35">
                <CardHeader>
                  <CardTitle className="text-base">One Weekly Theme</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {weeklyThemeExamples.map((theme) => (
                      <label className="rounded-full border bg-card/70 px-4 py-2 text-sm" key={theme}>
                        <input
                          className="mr-2"
                          defaultChecked={data.reset.weekTheme === theme}
                          name="theme"
                          type="radio"
                          value={theme}
                        />
                        {theme}
                      </label>
                    ))}
                  </div>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={weeklyThemeExamples.includes(data.reset.weekTheme as never) ? "" : data.reset.weekTheme ?? ""}
                    name="customTheme"
                    placeholder="Custom theme"
                  />
                </CardContent>
              </Card>

              <Card className="bg-background/35">
                <CardHeader>
                  <CardTitle className="text-base">Close Last Week</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Track the weekly metrics that matter. Enter how many days or sessions happened.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {weeklyHealthMetricTargets.map((metric) => (
                      <label className="grid gap-2 rounded-xl border bg-card/70 p-3 text-sm font-medium" key={metric.key}>
                        <span>{metric.label}</span>
                        <input
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={healthMetrics[metric.key] ?? ""}
                          max={7}
                          min={0}
                          name={metric.key}
                          placeholder={`Goal ${metric.target}`}
                          type="number"
                        />
                        <span className="text-xs text-muted-foreground">{metric.help}</span>
                      </label>
                    ))}
                  </div>
                  <div className="rounded-xl border bg-card/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Last 4 Weeks
                    </p>
                    <div className="mt-3 grid gap-3">
                      {weeklyHealthMetricTargets.map((metric) => {
                        const trend = summarizeWeeklyHealthTrend(
                          data.recentHealthMetrics,
                          metric.key,
                          metric.target
                        );

                        return (
                          <div className="grid gap-2 rounded-lg border bg-background/45 p-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center" key={metric.key}>
                            <p className="font-medium">{metric.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {trend.values.length > 0 ? (
                                trend.values.map((item) => (
                                  <span className="rounded-full border bg-card/80 px-2 py-0.5 text-xs" key={`${metric.key}-${item.weekOf.toISOString()}`}>
                                    {formatShortWeek(item.weekOf)}: {item.value}/{metric.target}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">No weekly history yet.</span>
                              )}
                            </div>
                            <span className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                              {trend.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-background/35">
                <CardHeader>
                  <CardTitle className="text-base">Prepare Next Week</CardTitle>
                  <CardDescription>
                    Close the loose loops that can quietly become next week's noise.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-card/70 p-3 text-sm">
                    <input
                      className="h-4 w-4"
                      defaultChecked={calendarPrep.cchcsImported}
                      name="cchcsImported"
                      type="checkbox"
                    />
                    <span>Import CCHCS calendar to Google Calendar</span>
                  </label>
                  <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-card/70 p-3 text-sm">
                    <input
                      className="h-4 w-4"
                      defaultChecked={calendarPrep.kidsEventsAdded}
                      name="kidsEventsAdded"
                      type="checkbox"
                    />
                    <span>Add kids events for the week to Google Calendar</span>
                  </label>
                  <label className="flex min-h-12 items-start gap-3 rounded-xl border bg-card/70 p-3 text-sm">
                    <input
                      className="mt-0.5 h-4 w-4"
                      defaultChecked={calendarPrep.flaggedCchcsEmailsChecked}
                      name="flaggedCchcsEmailsChecked"
                      type="checkbox"
                    />
                    <span>
                      Check flagged CCHCS emails.
                      <span className="block text-xs text-muted-foreground">Create tasks only for real commitments.</span>
                    </span>
                  </label>
                  <label className="flex min-h-12 items-start gap-3 rounded-xl border bg-card/70 p-3 text-sm">
                    <input
                      className="mt-0.5 h-4 w-4"
                      defaultChecked={calendarPrep.starredGmailChecked}
                      name="starredGmailChecked"
                      type="checkbox"
                    />
                    <span>
                      Check starred Gmail.
                      <span className="block text-xs text-muted-foreground">Task only what needs action.</span>
                    </span>
                  </label>
                  <label className="flex min-h-12 items-start gap-3 rounded-xl border bg-card/70 p-3 text-sm sm:col-span-2">
                    <input
                      className="mt-0.5 h-4 w-4"
                      defaultChecked={calendarPrep.appleNotesInboxProcessed}
                      name="appleNotesInboxProcessed"
                      type="checkbox"
                    />
                    <span>
                      Process Apple Notes inbox.
                      <span className="block text-xs text-muted-foreground">Commitment, project, parked idea, or reference only.</span>
                    </span>
                  </label>
                </CardContent>
              </Card>

              <SubmitButton className="w-fit" pendingLabel="Saving..." type="submit">
                Save Next Week
              </SubmitButton>
            </form>
          </StepShell>
        )}

        {activeStep === "people" && (
          <StepShell
            copy="Not tasks. Relationship intentions."
            eyebrow="Step 7"
            title="Who deserves intentional attention this week?"
          >
            <form action={savePeopleIntentionsAction} className="space-y-4">
              <textarea
                className="min-h-36 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm"
                defaultValue={peopleValue}
                name="peopleIntentions"
                placeholder={"Daughter\nCoworker\nCustomer\nFriend\nMyself"}
              />
              <SubmitButton pendingLabel="Saving..." type="submit">
                Save People Intentions
              </SubmitButton>
            </form>
          </StepShell>
        )}

        {activeStep === "printable" && (
          <StepShell
            copy="Review the weekly guide, print if useful, then close the reset."
            eyebrow="Step 8"
            title="Printable Week"
          >
            <div className="flex flex-wrap gap-3">
              <PrintBrowserButton />
              <form action={markWeeklyGuideGeneratedAction}>
                <SubmitButton className="h-10 rounded-md border border-border px-4 text-sm font-medium" pendingLabel="Recording..." type="submit">
                  Mark Guide Generated
                </SubmitButton>
              </form>
            </div>
            <div className="mt-6 rounded-2xl border bg-background/35 p-4">
              <WeeklyGuide data={data} />
            </div>
          </StepShell>
        )}

        {activeStep === "complete" && (
          <StepShell
            copy="You have chosen what deserves your attention. Everything else can wait."
            eyebrow="Step 9"
            title="Weekly Reset Complete"
          >
            <form action={completeWeeklyResetAction}>
              <SubmitButton className="h-11 rounded-full px-6" pendingLabel="Closing..." type="submit">
                Complete Weekly Reset
              </SubmitButton>
            </form>
          </StepShell>
        )}
      </div>

      <section className="weekly-guide-print-root print-only">
        <WeeklyGuide data={data} />
      </section>
    </main>
  );
}

function WeeklyGuide({
  data
}: {
  data: Awaited<ReturnType<typeof getGuidedWeeklyResetData>>;
}) {
  const currentSeason = data.workspace.seasons.find((season) => season.isCurrent) ?? null;
  const topThreeProjects = data.review.projects.filter((project) =>
    (data.outcomes.topThreeProjectIds ?? data.review.projects.filter((candidate) => candidate.weeklyFocus === "TOP_3").map((candidate) => candidate.id)).includes(project.id)
  );
  const people = data.outcomes.peopleIntentions ?? [];
  const healthMetrics = data.outcomes.healthMetrics ?? {};
  const calendarPrep = data.outcomes.calendarPrep ?? {};

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Weekly Guide</p>
        <h3 className="mt-1 text-2xl font-semibold">Week of {formatWeek(data.reset.weekOf)}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Current Season</p>
          <p className="mt-1 font-medium">{currentSeason?.title ?? "Choose a current season."}</p>
          <p className="mt-1 text-xs text-muted-foreground">Does this week's work support it?</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Theme</p>
          <p className="mt-1 font-medium">{data.reset.weekTheme || "Choose one theme before printing."}</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Needle Move Reminder</p>
          <p className="mt-1">Choose one completed result each morning before placing blocks.</p>
        </div>
      </div>
      <div className="rounded-xl border p-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Top 3 Projects</p>
        <ul className="mt-2 space-y-1">
          {topThreeProjects.length > 0 ? (
            topThreeProjects.map((project) => <li key={project.id}>{project.name}</li>)
          ) : (
            <li>No Top 3 selected.</li>
          )}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Health Signals</p>
          <ul className="mt-1 space-y-1">
            {weeklyHealthMetricTargets.map((metric) => (
              <li key={metric.key}>
                {metric.label}: {healthMetrics[metric.key] ?? 0}/{metric.target}
                {" "}
                ({summarizeWeeklyHealthTrend(data.recentHealthMetrics, metric.key, metric.target).label})
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Weekly Prep</p>
          <ul className="mt-1 space-y-1">
            <li>[{calendarPrep.cchcsImported ? "x" : " "}] Import CCHCS calendar to Google Calendar</li>
            <li>[{calendarPrep.kidsEventsAdded ? "x" : " "}] Add kids events for the week to Google Calendar</li>
            <li>[{calendarPrep.flaggedCchcsEmailsChecked ? "x" : " "}] Check flagged CCHCS emails</li>
            <li>[{calendarPrep.starredGmailChecked ? "x" : " "}] Check starred Gmail</li>
            <li>[{calendarPrep.appleNotesInboxProcessed ? "x" : " "}] Process Apple Notes inbox</li>
          </ul>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Important Meetings</p>
          <p className="mt-1">Review calendar before Monday planning.</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Notebook Reminder</p>
          <p className="mt-1">Index pages that became commitments, projects, parked ideas, or references.</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Relationship Intention</p>
          <p className="mt-1">{people.length > 0 ? people.join(", ") : "Choose who deserves attention this week."}</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Reading Reference</p>
          <p className="mt-1">Bhagavad Gita / Chapter 2</p>
        </div>
      </div>
    </div>
  );
}
