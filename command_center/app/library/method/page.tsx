const dailyProcess = [
  "Reflect on paper.",
  "Choose one completed result.",
  "Schedule the work realistically.",
  "Put the phone down and do the work.",
  "Return to capture, adjust, or close the day."
];

const weeklyProcess = [
  "Reflect on paper.",
  "Process the notebook.",
  "Reconcile projects digitally.",
  "Choose the next week.",
  "Print or prepare the weekly guide."
];

const paperItems = [
  "Spiritual reading and reflection",
  "Free-form thinking",
  "Meeting notes",
  "Sketches",
  "Emotional processing",
  "Early ideas",
  "Questions"
];

const ryanOsItems = [
  "True commitments",
  "Projects",
  "Next actions",
  "Deadlines",
  "Waiting items",
  "Scheduled work",
  "Searchable notebook indexes",
  "Weekly decisions"
];

const notCaptured = [
  "Every passing thought",
  "Curiosity without intent",
  "Ideas that have lost their energy",
  "Notes that already served their purpose",
  "Guilt disguised as a task"
];

const resetSystem = [
  "Open the notebook.",
  "Write everything creating mental noise.",
  "Choose one meaningful completed result.",
  "Enter only true commitments into RyanOS.",
  "Schedule the next visible action.",
  "Release the rest for now."
];

function NumberedSection({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="rounded-2xl border bg-card/80 p-5">
      <h3 className="text-xl font-semibold">{title}</h3>
      <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li className="flex gap-3" key={item}>
            <span className="text-primary">{index + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BulletSection({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="rounded-2xl border bg-card/80 p-5">
      <h3 className="text-xl font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li className="flex gap-3" key={item}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RyanOsMethodPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Library</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">The RyanOS Method</h2>
        <p className="mt-3 max-w-2xl text-lg text-primary">
          Paper is where you think. RyanOS is where you commit.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <NumberedSection items={dailyProcess} title="Daily Process" />
        <NumberedSection items={weeklyProcess} title="Weekly Process" />
        <BulletSection items={paperItems} title="What Belongs On Paper" />
        <BulletSection items={ryanOsItems} title="What Belongs In RyanOS" />
        <BulletSection items={notCaptured} title="What Does Not Need To Be Captured" />
        <NumberedSection items={resetSystem} title="Reset The System" />
      </div>
    </main>
  );
}
