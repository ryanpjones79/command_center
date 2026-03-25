import { nudgeExecutionTaskFollowUpAction } from "@/app/execution-actions";
import { ActionSheetSection } from "@/components/execution/action-sheet-section";
import { PrintActionSheetButton } from "@/components/execution/print-action-sheet-button";
import { QuickTaskForm } from "@/components/execution/quick-task-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { getActionSheetData } from "@/server/execution-service";

export default async function ActionSheetPage() {
  const user = await requireUser();
  const data = await getActionSheetData(user.id);

  return (
    <main className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Daily Command Center</p>
          <h2 className="text-4xl font-semibold tracking-tight">Action Sheet</h2>
          <p className="app-no-print mt-2 max-w-2xl text-sm text-muted-foreground">
            Your emailed Daily Brief stays separate. This page is the execution layer you print and run against it.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className="text-sm text-muted-foreground">{data.today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          <PrintActionSheetButton />
        </div>
      </section>

      <QuickTaskForm domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))} />

      <section className="print-sheet-grid grid gap-4 xl:grid-cols-2">
        <ActionSheetSection
          domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
          empty="Nothing committed for today yet."
          projects={data.projects.map((project) => ({ id: project.id, name: project.name, domainId: project.domainId }))}
          tasks={data.sections.today}
          title="Today"
        />
        <ActionSheetSection
          domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
          empty="Weekly runway is clear."
          projects={data.projects.map((project) => ({ id: project.id, name: project.name, domainId: project.domainId }))}
          tasks={data.sections.thisWeek}
          title="This Week"
        />
        <ActionSheetSection
          domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
          empty="No follow-ups are waiting right now."
          projects={data.projects.map((project) => ({ id: project.id, name: project.name, domainId: project.domainId }))}
          tasks={data.sections.waiting}
          title="Follow Up / Waiting"
        />
        <ActionSheetSection
          domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
          empty="No quick wins queued."
          projects={data.projects.map((project) => ({ id: project.id, name: project.name, domainId: project.domainId }))}
          tasks={data.sections.quickWins}
          title="Quick Wins"
        />
        <ActionSheetSection
          domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
          empty="Parking lot is empty."
          projects={data.projects.map((project) => ({ id: project.id, name: project.name, domainId: project.domainId }))}
          tasks={data.sections.parkingLot}
          title="Parking Lot"
        />
      </section>

      <section className="app-no-print grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 3 Weekly Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topThreeProjects.length === 0 && <p className="text-sm text-muted-foreground">Set three projects in Weekly Review.</p>}
            {data.topThreeProjects.map((project) => (
              <div key={project.id} className="rounded-lg border p-3">
                <p className="font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">{project.domain.name}</p>
                <p className="mt-1 text-sm">{project.nextAction || "Missing next action"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue Follow-Ups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueFollowUps.length === 0 && <p className="text-sm text-muted-foreground">No overdue follow-ups.</p>}
            {data.overdueFollowUps.map((task) => (
              <div key={task.id} className="rounded-lg border p-3">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.waitingOn || "Unassigned"} {task.followUpDate ? `- ${task.followUpDate.toLocaleDateString()}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={nudgeExecutionTaskFollowUpAction.bind(null, task.id, 2)}>
                    <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                      +2d
                    </button>
                  </form>
                  <form action={nudgeExecutionTaskFollowUpAction.bind(null, task.id, 7)}>
                    <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                      +1w
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocked Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.blockedItems.length === 0 && <p className="text-sm text-muted-foreground">No blocked items.</p>}
            {data.blockedItems.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{"title" in item ? item.title : item.name}</p>
                  <Badge variant="warning">Blocked</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.waitingOn || item.note || "Needs review"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stale Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.staleTasks.length === 0 && <p className="text-sm text-muted-foreground">No stale tasks needing review.</p>}
            {data.staleTasks.map((task) => (
              <div key={task.id} className="rounded-lg border p-3">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.domain.name} - updated {task.updatedAt.toLocaleDateString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
