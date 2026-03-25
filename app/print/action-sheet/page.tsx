import Link from "next/link";
import { PrintBrowserButton } from "@/components/execution/print-browser-button";
import { PrintSheetSection } from "@/components/execution/print-sheet-section";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getActionSheetData } from "@/server/execution-service";

type PrintActionSheetPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const compactLimits = {
  today: 6,
  thisWeek: 5,
  waiting: 5,
  quickWins: 3,
  parkingLot: 3
} as const;

function capSection<T>(items: T[], limit: number) {
  return {
    visible: items.slice(0, limit),
    overflowCount: Math.max(0, items.length - limit)
  };
}

export default async function PrintActionSheetPage({ searchParams }: PrintActionSheetPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const mode = typeof params.mode === "string" && params.mode === "extended" ? "extended" : "compact";
  const data = await getActionSheetData(user.id);

  const compact = {
    today: capSection(data.sections.today, compactLimits.today),
    thisWeek: capSection(data.sections.thisWeek, compactLimits.thisWeek),
    waiting: capSection(data.sections.waiting, compactLimits.waiting),
    quickWins: capSection(data.sections.quickWins, compactLimits.quickWins),
    parkingLot: capSection(data.sections.parkingLot, compactLimits.parkingLot)
  };

  const blockedNames = data.blockedItems
    .slice(0, 4)
    .map((item) => ("title" in item ? item.title : item.name));

  return (
    <main className="print-route-root space-y-4">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            body:has(.print-route-root) {
              background: #ffffff !important;
              color: #111111 !important;
            }

            body:has(.print-route-root) .app-shell-header {
              display: none !important;
            }

            body:has(.print-route-root) .app-shell-container {
              max-width: none !important;
              padding: 1rem !important;
            }

            @media print {
              body:has(.print-route-root) .app-shell-container {
                padding: 0 !important;
              }

              body:has(.print-route-root) .print-screen-controls {
                display: none !important;
              }

              body:has(.print-route-root) .print-page {
                box-shadow: none !important;
                margin: 0 !important;
                border: none !important;
              }

              body:has(.print-route-root) .print-page + .print-page {
                break-before: page;
                page-break-before: always;
              }
            }
          `
        }}
      />

      <section className="print-screen-controls flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 text-black shadow-sm">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-black/60">Print Action Sheet</p>
          <h2 className="text-2xl font-semibold">Daily Action Companion</h2>
          <p className="mt-1 text-sm text-black/60">
            Compact mode is capped to one page. Extended mode uses two fixed pages with no fragmented sections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant={mode === "compact" ? "default" : "outline"}>
            <Link href="/print/action-sheet?mode=compact">Compact 1-Page</Link>
          </Button>
          <Button asChild variant={mode === "extended" ? "default" : "outline"}>
            <Link href="/print/action-sheet?mode=extended">Extended 2-Page</Link>
          </Button>
          <PrintBrowserButton />
          <Button asChild variant="outline">
            <Link href="/">Back to Dashboard</Link>
          </Button>
        </div>
      </section>

      {mode === "compact" ? (
        <section className="print-page mx-auto min-h-[11in] w-full max-w-[8.5in] border border-black/15 bg-white px-[0.45in] py-[0.4in] text-black shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-black/20 pb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-black/60">Action Sheet</p>
              <h1 className="text-3xl font-semibold">Daily Command Center</h1>
            </div>
            <div className="text-right text-xs text-black/65">
              <p>{data.today.toLocaleDateString(undefined, { weekday: "long" })}</p>
              <p>{data.today.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
              <p className="mt-1 uppercase tracking-[0.18em]">Compact 1-Page</p>
            </div>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1.15fr 0.85fr" }}>
            <div className="space-y-3">
              <PrintSheetSection
                empty="No execution items set for today."
                mode="compact"
                overflowCount={compact.today.overflowCount}
                tasks={compact.today.visible}
                title="Today"
              />
              <PrintSheetSection
                empty="No active weekly runway."
                mode="compact"
                overflowCount={compact.thisWeek.overflowCount}
                tasks={compact.thisWeek.visible}
                title="This Week"
              />
              <PrintSheetSection
                empty="No follow-ups waiting."
                mode="compact"
                overflowCount={compact.waiting.overflowCount}
                tasks={compact.waiting.visible}
                title="Follow Up / Waiting"
              />
            </div>
            <div className="space-y-3">
              <PrintSheetSection
                empty="No quick wins queued."
                mode="compact"
                overflowCount={compact.quickWins.overflowCount}
                tasks={compact.quickWins.visible}
                title="Quick Wins"
              />
              <PrintSheetSection
                empty="Parking lot is empty."
                mode="compact"
                overflowCount={compact.parkingLot.overflowCount}
                tasks={compact.parkingLot.visible}
                title="Parking Lot"
              />

              <section className="rounded-none border border-black/30 px-3 py-2">
                <div className="mb-2 border-b border-black/20 pb-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-black">Top 3 Weekly Projects</h3>
                </div>
                {data.topThreeProjects.length === 0 ? (
                  <p className="py-2 text-[10px] text-black/55">No Top 3 projects selected yet.</p>
                ) : (
                  <ul className="space-y-2 text-[10px] text-black/75">
                    {data.topThreeProjects.map((project) => (
                      <li key={project.id}>
                        <p className="font-semibold text-black">{project.name}</p>
                        <p>{project.nextAction || "Missing next action"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-none border border-black/30 px-3 py-2">
                <div className="mb-2 border-b border-black/20 pb-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-black">Exceptions</h3>
                </div>
                <div className="space-y-2 text-[10px] text-black/75">
                  <p>Overdue follow-ups: {data.overdueFollowUps.length}</p>
                  <p>Blocked items: {data.blockedItems.length}</p>
                  <p>Stale tasks: {data.staleTasks.length}</p>
                  {blockedNames.length > 0 && <p>Blocked now: {blockedNames.join(", ")}</p>}
                </div>
              </section>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="print-page mx-auto min-h-[11in] w-full max-w-[8.5in] border border-black/15 bg-white px-[0.45in] py-[0.4in] text-black shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-black/20 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-black/60">Action Sheet</p>
                <h1 className="text-3xl font-semibold">Daily Command Center</h1>
              </div>
              <div className="text-right text-xs text-black/65">
                <p>{data.today.toLocaleDateString(undefined, { weekday: "long" })}</p>
                <p>{data.today.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
                <p className="mt-1 uppercase tracking-[0.18em]">Extended 2-Page</p>
              </div>
            </div>

            <div className="space-y-4">
              <PrintSheetSection empty="No execution items set for today." mode="extended" tasks={data.sections.today} title="Today" />
              <PrintSheetSection empty="No active weekly runway." mode="extended" tasks={data.sections.thisWeek} title="This Week" />
              <PrintSheetSection empty="No follow-ups waiting." mode="extended" tasks={data.sections.waiting} title="Follow Up / Waiting" />
            </div>
          </section>

          <section className="print-page mx-auto min-h-[11in] w-full max-w-[8.5in] border border-black/15 bg-white px-[0.45in] py-[0.4in] text-black shadow-sm">
            <div className="mb-4 border-b border-black/20 pb-3">
              <h2 className="text-2xl font-semibold">Page 2</h2>
              <p className="mt-1 text-sm text-black/60">Secondary workload, project focus, and exceptions.</p>
            </div>

            <div className="space-y-4">
              <PrintSheetSection empty="No quick wins queued." mode="extended" tasks={data.sections.quickWins} title="Quick Wins" />
              <PrintSheetSection empty="Parking lot is empty." mode="extended" tasks={data.sections.parkingLot} title="Parking Lot" />

              <section className="rounded-none border border-black/30 px-3 py-2">
                <div className="mb-2 border-b border-black/20 pb-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-black">Top 3 Weekly Projects</h3>
                </div>
                {data.topThreeProjects.length === 0 ? (
                  <p className="py-2 text-[10px] text-black/55">No Top 3 projects selected yet.</p>
                ) : (
                  <ul className="space-y-2 text-[10px] text-black/75">
                    {data.topThreeProjects.map((project) => (
                      <li key={project.id}>
                        <p className="font-semibold text-black">{project.name}</p>
                        <p>{project.domain.name}</p>
                        <p>{project.nextAction || "Missing next action"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-none border border-black/30 px-3 py-2">
                <div className="mb-2 border-b border-black/20 pb-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-black">Exceptions</h3>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="text-[10px] text-black/75">
                    <p className="font-semibold text-black">Overdue Follow-Ups</p>
                    {data.overdueFollowUps.length === 0 ? (
                      <p>None</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {data.overdueFollowUps.slice(0, 5).map((task) => (
                          <li key={task.id}>{task.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-[10px] text-black/75">
                    <p className="font-semibold text-black">Blocked Items</p>
                    {data.blockedItems.length === 0 ? (
                      <p>None</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {data.blockedItems.slice(0, 5).map((item) => (
                          <li key={item.id}>{"title" in item ? item.title : item.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-[10px] text-black/75">
                    <p className="font-semibold text-black">Stale Tasks</p>
                    {data.staleTasks.length === 0 ? (
                      <p>None</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {data.staleTasks.slice(0, 5).map((task) => (
                          <li key={task.id}>{task.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
