import Link from "next/link";
import {
  completeSeasonAction,
  setCurrentSeasonAction,
  updateSeasonAction
} from "@/app/library/seasons/actions";
import { SeasonForm } from "@/components/library/season-form";
import { SubmitButton } from "@/components/execution/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatSeasonStatus,
  seasonIconOptions,
  seasonStatuses,
  seasonThemeColors
} from "@/lib/season-options";
import { requireUser } from "@/lib/session";
import { getSeasonArchive } from "@/server/season-service";

function formatDate(value: Date | null) {
  if (!value) return "Open";
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function dateInputValue(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function completedYear(value: Date | null) {
  return String((value ?? new Date()).getFullYear());
}

export default async function SeasonArchivePage() {
  const user = await requireUser();
  const { currentSeason, seasons, completedSeasons } = await getSeasonArchive(user.id);
  const groupedCompleted = completedSeasons.reduce<Record<string, typeof completedSeasons>>(
    (groups, season) => {
      const year = completedYear(season.completedAt ?? season.startedAt);
      groups[year] = [...(groups[year] ?? []), season];
      return groups;
    },
    {}
  );

  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Library
        </p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">
          Season Archive
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Seasons hold projects in context. They answer what kind of life this
          stretch is serving before the task list starts talking.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add Season</CardTitle>
          </CardHeader>
          <CardContent>
            <SeasonForm />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden border-primary/30 bg-card/90">
            <CardContent className="pt-6">
              {currentSeason ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Current Season
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: currentSeason.themeColor ?? "#0f766e" }}
                      />
                      <h3 className="text-2xl font-semibold">
                        {currentSeason.title}
                      </h3>
                      <Badge variant="secondary">{currentSeason.icon ?? "Building"}</Badge>
                    </div>
                    {currentSeason.description && (
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {currentSeason.description}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {currentSeason.projects.length > 0 ? (
                        currentSeason.projects.map((project) => (
                          <Badge key={project.id} variant="outline">
                            {project.name}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No projects assigned yet.
                        </p>
                      )}
                    </div>
                  </div>
                  <form action={completeSeasonAction.bind(null, currentSeason.id)}>
                    <SubmitButton
                      className="h-9 rounded-md border border-border px-4 text-sm"
                      pendingLabel="Closing..."
                      type="submit"
                    >
                      Complete Season
                    </SubmitButton>
                  </form>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Current Season
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    No current season yet. Add one when you want RyanOS to carry
                    a compass heading above the project list.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {seasons.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  No seasons yet. Start with the season you are already in.
                </p>
              </CardContent>
            </Card>
          )}

          {seasons.map((season) => (
            <Card key={season.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: season.themeColor ?? "#0f766e" }}
                      />
                      {season.title}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(season.startedAt)} - {formatDate(season.completedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {season.isCurrent && <Badge>Current</Badge>}
                    <Badge variant="outline">{formatSeasonStatus(season.status)}</Badge>
                    <Badge variant="secondary">{season.icon ?? "Building"}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {season.description && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {season.description}
                  </p>
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Projects
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {season.projects.length > 0 ? (
                      season.projects.map((project) => (
                        <Button
                          asChild
                          className="h-8 rounded-full px-3 text-xs"
                          key={project.id}
                          variant="outline"
                        >
                          <Link href={`/projects?projectId=${project.id}`}>
                            {project.name}
                          </Link>
                        </Button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No projects assigned.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!season.isCurrent && season.status !== "COMPLETED" && (
                    <form action={setCurrentSeasonAction.bind(null, season.id)}>
                      <SubmitButton
                        className="h-8 rounded-md border border-border px-3 text-xs"
                        pendingLabel="Setting..."
                        type="submit"
                      >
                        Set Current
                      </SubmitButton>
                    </form>
                  )}
                  {season.status !== "COMPLETED" && (
                    <form action={completeSeasonAction.bind(null, season.id)}>
                      <SubmitButton
                        className="h-8 rounded-md border border-border px-3 text-xs"
                        pendingLabel="Closing..."
                        type="submit"
                      >
                        Complete
                      </SubmitButton>
                    </form>
                  )}
                </div>

                <details className="rounded-lg border border-border/70 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Edit Season
                  </summary>
                  <form
                    action={updateSeasonAction.bind(null, season.id)}
                    className="mt-3 grid gap-3"
                  >
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue={season.title}
                      name="title"
                      required
                    />
                    <textarea
                      className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      defaultValue={season.description ?? ""}
                      name="description"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={dateInputValue(season.startedAt)}
                        name="startedAt"
                        type="date"
                      />
                      <input
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={dateInputValue(season.completedAt)}
                        name="completedAt"
                        type="date"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={season.status}
                        name="status"
                      >
                        {seasonStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatSeasonStatus(status)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={season.icon ?? "Building"}
                        name="icon"
                      >
                        {seasonIconOptions.map((icon) => (
                          <option key={icon} value={icon}>
                            {icon}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={season.themeColor ?? seasonThemeColors[0].value}
                        name="themeColor"
                      >
                        {seasonThemeColors.map((color) => (
                          <option key={color.value} value={color.value}>
                            {color.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        className="h-4 w-4"
                        defaultChecked={season.isCurrent}
                        name="isCurrent"
                        type="checkbox"
                      />
                      Current Season
                    </label>
                    <SubmitButton
                      className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                      pendingLabel="Saving..."
                      type="submit"
                    >
                      Save Season
                    </SubmitButton>
                  </form>
                </details>
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Completed Seasons</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.keys(groupedCompleted).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Completed seasons will collect here by year.
                </p>
              )}
              {Object.entries(groupedCompleted)
                .sort(([left], [right]) => Number(right) - Number(left))
                .map(([year, yearSeasons]) => (
                  <div key={year}>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {year}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {yearSeasons.map((season) => (
                        <Badge key={season.id} variant="outline">
                          {season.title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
