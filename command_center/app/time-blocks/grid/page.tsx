import type { Metadata } from "next";
import Link from "next/link";
import { TimeBlockBoard } from "@/components/execution/time-block-board";
import { requireUser } from "@/lib/session";
import { getTimeBlockPlannerData } from "@/server/execution-service";
import { getTodaysPrinciple } from "@/server/wisdom-service";

export const metadata: Metadata = { title: "Detailed grid" };

function dateFromParam(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

// The classic drag-and-drop day grid, kept for hands-on rearranging.
export default async function TimeBlockGridPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const selectedDate = dateFromParam(typeof params.date === "string" ? params.date : undefined);
  const [planner, todaysPrinciple] = await Promise.all([getTimeBlockPlannerData(user.id, selectedDate), getTodaysPrinciple(user.id)]);

  return (
    <div className="space-y-4">
      <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" href="/time-blocks">← Today</Link>
      <TimeBlockBoard
        calendarEvents={planner.calendarEvents}
        currentSeason={planner.currentSeason}
        dailyPlan={planner.dailyPlan}
        date={planner.date}
        rykasDay={planner.rykasDay}
        scheduledTasks={planner.scheduledTasks}
        timeZone={planner.timeZone}
        todaysPrinciple={todaysPrinciple}
        unscheduledTasks={planner.unscheduledTasks}
        variant="grid"
      />
    </div>
  );
}
