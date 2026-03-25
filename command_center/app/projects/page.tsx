import {
  deleteExecutionProjectAction,
  updateExecutionProjectAction
} from "@/app/execution-actions";
import { CreateDomainForm } from "@/components/execution/create-domain-form";
import { CreateProjectForm } from "@/components/execution/create-project-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { executionSelectOptions, formatExecutionLabel } from "@/lib/execution-options";
import { requireUser } from "@/lib/session";
import { getProjectMaintenanceData } from "@/server/execution-service";

export default async function ProjectsPage() {
  const user = await requireUser();
  const { projects, domains } = await getProjectMaintenanceData(user.id);

  return (
    <main className="space-y-6">
      <section>
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Project List</p>
        <h2 className="text-4xl font-semibold tracking-tight">Project Reference</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This is the lighter maintenance view. Projects exist to support weekly clarity, not to become your daily operating surface.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add Domain</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateDomainForm />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add Project</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateProjectForm domains={domains.map((domain) => ({ id: domain.id, name: domain.name }))} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {projects.length === 0 && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              </CardContent>
            </Card>
          )}

          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{project.domain.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{formatExecutionLabel(project.status)}</Badge>
                    <Badge variant="outline">{formatExecutionLabel(project.activeStatus)}</Badge>
                    <Badge variant={project.weeklyFocus === "TOP_3" ? "default" : "secondary"}>
                      {formatExecutionLabel(project.weeklyFocus)}
                    </Badge>
                    <Badge variant="secondary">{formatExecutionLabel(project.priority)}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next Action</p>
                    <p className="mt-1 text-sm">{project.nextAction || "Missing next action"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Waiting On</p>
                    <p className="mt-1 text-sm">{project.waitingOn || "None"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last Updated</p>
                    <p className="mt-1 text-sm">{project.updatedAt.toLocaleDateString()}</p>
                  </div>
                </div>

                {project.note && <p className="text-sm text-muted-foreground">{project.note}</p>}

                {project.tasks.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Linked Tasks</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {project.tasks.map((task) => (
                        <span key={task.id} className="rounded-full border px-3 py-1 text-xs">
                          {task.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <details className="rounded-lg border border-border/70 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Edit Project</summary>
                  <form action={updateExecutionProjectAction} className="mt-3 grid gap-3">
                    <input name="projectId" type="hidden" value={project.id} />
                    <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.domainId} name="domainId">
                      {domains.map((domain) => (
                        <option key={domain.id} value={domain.id}>
                          {domain.name}
                        </option>
                      ))}
                    </select>
                    <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.name} name="name" required />
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.status} name="status">
                        {executionSelectOptions.projectStatuses.map((value) => (
                          <option key={value} value={value}>
                            {formatExecutionLabel(value)}
                          </option>
                        ))}
                      </select>
                      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.activeStatus} name="activeStatus">
                        {executionSelectOptions.activeStatuses.map((value) => (
                          <option key={value} value={value}>
                            {formatExecutionLabel(value)}
                          </option>
                        ))}
                      </select>
                      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.weeklyFocus} name="weeklyFocus">
                        {executionSelectOptions.weeklyFocuses.map((value) => (
                          <option key={value} value={value}>
                            {formatExecutionLabel(value)}
                          </option>
                        ))}
                      </select>
                      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.priority} name="priority">
                        {executionSelectOptions.priorities.map((value) => (
                          <option key={value} value={value}>
                            {formatExecutionLabel(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.nextAction ?? ""} name="nextAction" placeholder="Next action" />
                    <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.waitingOn ?? ""} name="waitingOn" placeholder="Waiting on" />
                    <textarea className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={project.note ?? ""} name="note" />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input className="h-4 w-4" defaultChecked={project.blocked} name="blocked" type="checkbox" />
                      Blocked
                    </label>
                    <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
                      Save
                    </button>
                  </form>
                  <form action={deleteExecutionProjectAction} className="mt-3">
                    <input name="projectId" type="hidden" value={project.id} />
                    <button className="h-9 rounded-md border border-destructive px-4 text-sm text-destructive" type="submit">
                      Delete Project
                    </button>
                  </form>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
