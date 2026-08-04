import { PrintBrowserButton } from "@/components/execution/print-browser-button";

const paperItems = [
  "Read",
  "Reflect",
  "Think",
  "Sketch",
  "Meetings",
  "Prayer",
  "Meditation",
  "Questions"
];

const ryanOsItems = [
  "Commit",
  "Projects",
  "Time Blocks",
  "Tasks",
  "Reviews",
  "Calendar",
  "Notebook Index"
];

const dailyRhythm = [
  "Morning Compass",
  "Needle Move",
  "Presence",
  "Way of Being",
  "Schedule",
  "Live",
  "Shutdown"
];

const weeklyRhythm = [
  "Reflect",
  "Notebook",
  "Projects",
  "Weekly Theme",
  "Weekly Guide"
];

const principles = [
  "Paper is where you think.",
  "RyanOS is where you commit.",
  "Protect attention.",
  "Capture less.",
  "Commit deliberately.",
  "Finish before adding.",
  "Leave the app.",
  "Return only when needed."
];

const notCaptured = [
  "Passing thoughts",
  "Random internet ideas",
  "Everything you read",
  "Emotional reactions",
  "Curiosity without intention",
  "Guilt disguised as a task"
];

const resetSteps = [
  "Open the notebook.",
  "Write everything.",
  "Choose one completed result.",
  "Commit only what matters.",
  "Schedule the next action.",
  "Release the rest."
];

function MethodCard({
  eyebrow,
  title,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.75rem] border bg-card/82 p-5 shadow-sm sm:p-6 ${className}`}>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SplitList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          className="rounded-2xl border bg-background/55 px-4 py-3 text-sm font-medium"
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function Flow({ items }: { items: string[] }) {
  return (
    <ol className="grid gap-2">
      {items.map((item, index) => (
        <li className="grid gap-2" key={item}>
          <div className="flex items-center gap-3 rounded-2xl border bg-background/55 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {index + 1}
            </span>
            <span className="text-sm font-medium">{item}</span>
          </div>
          {index < items.length - 1 && (
            <span
              aria-hidden="true"
              className="ml-7 h-4 w-px rounded-full bg-border"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function CompactList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li className="flex gap-3" key={item}>
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PrintableMethod() {
  return (
    <section className="method-print-root print-only">
      <div className="method-print-header">
        <p>RyanOS Method</p>
        <h1>Paper is where you think. RyanOS is where you commit.</h1>
      </div>
      <div className="method-print-grid">
        <div className="method-print-card method-print-wide">
          <h2>Why RyanOS Exists</h2>
          <p>
            RyanOS helps you leave the app with clarity and return to the people
            and work that matter.
          </p>
        </div>
        <div className="method-print-card">
          <h2>Paper</h2>
          <p>{paperItems.join(" / ")}</p>
        </div>
        <div className="method-print-card">
          <h2>RyanOS</h2>
          <p>{ryanOsItems.join(" / ")}</p>
        </div>
        <div className="method-print-card">
          <h2>Daily Rhythm</h2>
          <p>{dailyRhythm.join(" -> ")}</p>
        </div>
        <div className="method-print-card">
          <h2>Weekly Rhythm</h2>
          <p>{weeklyRhythm.join(" -> ")}</p>
        </div>
        <div className="method-print-card">
          <h2>Core Principles</h2>
          <p>{principles.join(" ")}</p>
        </div>
        <div className="method-print-card">
          <h2>Do Not Capture</h2>
          <p>{notCaptured.join(" / ")}</p>
        </div>
        <div className="method-print-card">
          <h2>Reset</h2>
          <p>{resetSteps.join(" ")}</p>
        </div>
        <div className="method-print-card">
          <h2>Season Philosophy</h2>
          <p>
            Life happens in seasons. Projects support seasons. Tasks support
            projects. Needle Moves support today.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function RyanOsMethodPage() {
  return (
    <main className="space-y-6">
      <div className="app-no-print space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border bg-card/90 p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(16,185,129,0.14),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.12),transparent_28%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Library
              </p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                The RyanOS Method
              </h2>
              <p className="mt-4 max-w-2xl text-xl leading-8 text-primary">
                Paper is where you think. RyanOS is where you commit.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <PrintBrowserButton />
            </div>
          </div>
        </section>

        <MethodCard eyebrow="Why RyanOS Exists" title="Leave The App With Clarity">
          <div className="grid gap-4 text-base leading-7 text-muted-foreground lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <p>
                Most productivity systems encourage you to capture more,
                organize more, optimize more, and spend more time inside the
                app.
              </p>
              <p>RyanOS has a different goal.</p>
              <p>
                Its purpose is to help you leave the app with clarity and return
                to the people and work that matter.
              </p>
            </div>
            <blockquote className="rounded-[1.5rem] border bg-background/55 p-5 text-lg font-medium leading-7 text-foreground">
              Choose what matters. Block when it happens. Then go live it.
            </blockquote>
          </div>
        </MethodCard>

        <section className="grid gap-4 lg:grid-cols-2">
          <MethodCard eyebrow="Paper vs RyanOS" title="Paper">
            <SplitList items={paperItems} />
          </MethodCard>
          <MethodCard eyebrow="Paper vs RyanOS" title="RyanOS">
            <SplitList items={ryanOsItems} />
          </MethodCard>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <MethodCard eyebrow="Daily Rhythm" title="How A Day Moves">
            <Flow items={dailyRhythm} />
          </MethodCard>
          <MethodCard eyebrow="Weekly Rhythm" title="How A Week Resets">
            <Flow items={weeklyRhythm} />
          </MethodCard>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <MethodCard
            className="lg:col-span-2"
            eyebrow="Core Principles"
            title="The Operating Rules"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {principles.map((principle) => (
                <div
                  className="rounded-2xl border bg-background/55 p-4 text-sm font-medium"
                  key={principle}
                >
                  {principle}
                </div>
              ))}
            </div>
          </MethodCard>
          <MethodCard eyebrow="What Not To Capture" title="Let It Pass">
            <CompactList items={notCaptured} />
          </MethodCard>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <MethodCard eyebrow="Reset The System" title="When Overwhelmed">
            <Flow items={resetSteps} />
          </MethodCard>
          <MethodCard eyebrow="Season Philosophy" title="Context Before Tasks">
            <div className="space-y-4 text-base leading-7 text-muted-foreground">
              <p>Life happens in seasons.</p>
              <div className="rounded-[1.5rem] border bg-background/55 p-5">
                <p>Projects support seasons.</p>
                <p>Tasks support projects.</p>
                <p>Needle Moves support today.</p>
              </div>
              <p>
                The point is not to organize everything. The point is to know
                what kind of life this stretch is asking you to build.
              </p>
            </div>
          </MethodCard>
        </section>
      </div>

      <PrintableMethod />
    </main>
  );
}
