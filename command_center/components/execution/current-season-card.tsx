type CurrentSeasonCardProps = {
  season: {
    description: string | null;
    icon: string | null;
    projects: { id: string; name: string }[];
    themeColor: string | null;
    title: string;
  } | null;
};

export function CurrentSeasonCard({ season }: CurrentSeasonCardProps) {
  if (!season) {
    return (
      <section className="rounded-[1.5rem] border border-dashed bg-card/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Current Season
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              No season set. Today can still run; projects are just missing a
              compass heading.
            </p>
          </div>
          <Link
            className="rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            href="/library/seasons"
          >
            Set season
          </Link>
        </div>
      </section>
    );
  }

  const projectNames = season.projects.map((project) => project.name).slice(0, 6);

  return (
    <section className="overflow-hidden rounded-[1.5rem] border bg-card/90 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Current Season
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: season.themeColor ?? "#0f766e" }}
            />
            <h3 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {season.title}
            </h3>
            <span className="hidden rounded-full border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
              {season.icon ?? "Building"}
            </span>
          </div>
          {season.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {season.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:max-w-md sm:justify-end">
          {projectNames.length > 0 ? (
            projectNames.map((name) => (
              <span
                className="rounded-full border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
                key={name}
              >
                {name}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
              No projects assigned
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
import Link from "next/link";
