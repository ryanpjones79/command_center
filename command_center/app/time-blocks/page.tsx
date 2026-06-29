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

export default async function TimeBlocksPage({ searchParams }: TimeBlocksPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const selectedDate = dateFromParam(firstParam(params.date));
  const planner = await getTimeBlockPlannerData(user.id, selectedDate);

  return (
    <main className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Calendar Planner</p>
          <h2 className="text-4xl font-semibold tracking-tight">Time Blocks</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Imported Google Calendar events stay read-only. Drag Action OS tasks into open slots to build the day.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/time-blocks?date=${dateKey(addDays(selectedDate, -1))}`}>Previous</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/time-blocks">Today</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/time-blocks?date=${dateKey(addDays(selectedDate, 1))}`}>Next</Link>
          </Button>
        </div>
      </section>

      <TimeBlockBoard
        calendarEvents={planner.calendarEvents}
        date={planner.date}
        scheduledTasks={planner.scheduledTasks}
        unscheduledTasks={planner.unscheduledTasks}
      />
    </main>
  );
}
