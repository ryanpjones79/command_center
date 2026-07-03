import Link from "next/link";
import { TimeBlockBoard } from "@/components/execution/time-block-board";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getTimeBlockPlannerData } from "@/server/execution-service";

type TimeBlocksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dateFromParam(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export default async function TimeBlocksPage({
  searchParams
}: TimeBlocksPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const selectedDate = dateFromParam(firstParam(params.date));
  const planner = await getTimeBlockPlannerData(user.id, selectedDate);

  return (
    <main className="space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-[1.75rem] border bg-card/90 p-4 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(16,185,129,0.16),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(245,158,11,0.13),transparent_26%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              RyanOS Execution
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              Today Command Board
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              RyanOS decides what matters. Time blocking decides when it
              happens.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <Button
              asChild
              className="h-10 rounded-xl px-3 text-xs sm:text-sm"
              variant="outline"
            >
              <Link
                href={`/time-blocks?date=${dateKey(addDays(selectedDate, -1))}`}
              >
                Previous
              </Link>
            </Button>
            <Button
              asChild
              className="h-10 rounded-xl px-3 text-xs sm:text-sm"
              variant="outline"
            >
              <Link href="/time-blocks">Today</Link>
            </Button>
            <Button
              asChild
              className="h-10 rounded-xl px-3 text-xs sm:text-sm"
              variant="outline"
            >
              <Link
                href={`/time-blocks?date=${dateKey(addDays(selectedDate, 1))}`}
              >
                Next
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <TimeBlockBoard
        calendarEvents={planner.calendarEvents}
        date={planner.date}
        scheduledTasks={planner.scheduledTasks}
        timeZone={planner.timeZone}
        unscheduledTasks={planner.unscheduledTasks}
      />
    </main>
  );
}
