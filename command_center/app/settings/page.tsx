import Link from "next/link";
import { seedExecutionDomainsAction } from "@/app/execution-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { getExecutionWorkspace } from "@/server/execution-service";

export default async function SettingsPage() {
  const user = await requireUser();
  const workspace = await getExecutionWorkspace(user.id);

  return (
    <main className="space-y-6">
      <section>
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Settings + Architecture</p>
        <h2 className="text-4xl font-semibold tracking-tight">Execution System Notes</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This site now supports Daily Brief preview and email send alongside Action Sheet printing, follow-up visibility, and weekly project control.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended Page Structure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>`/` Daily Command Center + printable Action Sheet</p>
            <p>`/daily-brief` live Daily Brief preview + email send</p>
            <p>`/print/action-sheet` dedicated compact or extended print route</p>
            <p>`/weekly-review` Weekly Review / Project Control</p>
            <p>`/tasks` Full Task List maintenance</p>
            <p>`/projects` Project List maintenance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended Component Structure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>`components/execution/action-sheet-section.tsx` section renderer</p>
            <p>`components/execution/task-line-item.tsx` compact printable task row</p>
            <p>`components/execution/quick-task-form.tsx` low-friction daily capture</p>
            <p>`components/execution/print-sheet-section.tsx` and `print-sheet-task-row.tsx` print-only artifact components</p>
            <p>`components/execution/create-task-form.tsx` and `create-project-form.tsx` maintenance forms</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Field Mapping From Legacy Area/Project/Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><code>Area.name</code> to <code>ExecutionDomain.name</code></p>
            <p><code>Project.priority</code> to <code>ExecutionProject.priority</code></p>
            <p><code>Project.status</code> splits into <code>status</code> and <code>activeStatus</code></p>
            <p><code>Project.nextAction</code> to <code>ExecutionProject.nextAction</code></p>
            <p><code>Task.title</code> to <code>ExecutionTask.title</code></p>
            <p><code>Task.priority</code> to <code>ExecutionTask.priority</code></p>
            <p><code>Task.dueDate</code> to <code>ExecutionTask.dueDate</code></p>
            <p><code>Task.details</code> to <code>ExecutionTask.note</code></p>
            <p><code>Task stays visible for multiple days</code> to <code>ExecutionTask.pinToTodayUntilDone</code></p>
            <p><code>Task.tags</code> becomes heuristics for <code>type</code>, <code>whenBucket</code>, and <code>status</code></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Migration Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Seed domains and create the execution tables.</p>
            <p>2. Import legacy Area/Project/Task data into ExecutionDomain, ExecutionProject, and ExecutionTask.</p>
            <p>3. Default unmapped tasks to `LATER` and `ACTION` so nothing disappears.</p>
            <p>4. Use `pinToTodayUntilDone` only for work that should intentionally survive across days.</p>
            <p>5. Weekly review is where projects get cleaned up into `Top 3`, `Active`, or `Parked`.</p>
            <p>6. Daily use happens from the Action Sheet, not the project list.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution Domains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action={seedExecutionDomainsAction}>
              <Button type="submit" variant="outline">
                Re-seed Default Domains
              </Button>
            </form>
            <div className="space-y-2 text-sm text-muted-foreground">
              {workspace.domains.map((domain) => (
                <p key={domain.id}>
                  {domain.name} ({domain.slug})
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Legacy Market Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>The older watchlist/signals workflow is still preserved, but it is no longer the primary navigation.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/watchlist">Watchlist</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/signals">Signals</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/market-settings">Market Settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
