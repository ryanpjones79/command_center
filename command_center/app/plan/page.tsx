import type { Metadata } from "next";
import { PlanBoard } from "@/components/plan/plan-board";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadBoard } from "@/server/v2/board";
import { syncCalendar } from "@/server/v2/calendar-sync";
import { googleCalendarLoader } from "@/server/v2/day";

export const metadata: Metadata = { title: "Plan" };
export const dynamic = "force-dynamic";

const VIEWS = { day: 1, "3": 3, week: 7 } as const;

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const view = (params.view && params.view in VIEWS ? params.view : "day") as keyof typeof VIEWS;
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? new Date(`${params.date}T12:00:00Z`) : undefined;
  // Bring in moves made in Google Calendar before drawing the day.
  await syncCalendar(user.id, prisma).catch(() => null);
  const calendar = googleCalendarLoader();
  const board = await loadBoard(user.id, prisma, calendar, { anchor, dayCount: VIEWS[view] });
  return <PlanBoard board={board} view={view} />;
}
