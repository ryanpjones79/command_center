import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { NOT_STARTED: "Open", IN_PROGRESS: "In progress", WAITING: "Waiting", DONE: "Done", DROPPED: "Dropped" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 120);

  const [tasks, projects, notes] = q
    ? await Promise.all([
        prisma.executionTask.findMany({
          where: { userId: user.id, OR: [{ title: { contains: q } }, { note: { contains: q } }, { doneWhen: { contains: q } }] },
          orderBy: { updatedAt: "desc" },
          take: 30,
          select: { id: true, title: true, status: true, sourceSystem: true, project: { select: { name: true } } }
        }),
        prisma.executionProject.findMany({
          where: { userId: user.id, OR: [{ name: { contains: q } }, { desiredOutcome: { contains: q } }, { note: { contains: q } }] },
          take: 10,
          select: { id: true, name: true }
        }),
        prisma.parkedIdea.findMany({
          where: { userId: user.id, idea: { contains: q } },
          orderBy: { touchedAt: "desc" },
          take: 20,
          select: { id: true, idea: true, status: true }
        })
      ])
    : [[], [], []];
  const total = tasks.length + projects.length + notes.length;

  return (
    <div className="space-y-6">
      <form action="/search" className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="search-q">Search RyanOS</label>
        <input
          autoFocus
          className="h-12 flex-1 rounded-xl border bg-card px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={q}
          id="search-q"
          name="q"
          placeholder="Search tasks, projects and notes"
          type="search"
        />
        <button className="h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="submit">
          Search
        </button>
      </form>

      {q && total === 0 && <p className="text-sm text-muted-foreground">Nothing matches “{q}”.</p>}

      {tasks.length > 0 && (
        <section aria-labelledby="search-tasks">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground" id="search-tasks">Tasks</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/tasks?taskId=${encodeURIComponent(task.id)}`}>
                  <span className="min-w-0 break-words font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[task.project?.name, task.sourceSystem, STATUS_LABEL[task.status] ?? task.status].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {projects.length > 0 && (
        <section aria-labelledby="search-projects">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground" id="search-projects">Projects</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {projects.map((project) => (
              <li key={project.id}>
                <Link className="block px-4 py-3 font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/projects#project-${project.id}`}>{project.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="search-notes">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground" id="search-notes">Captures and notes</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {notes.map((note) => (
              <li className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3" key={note.id}>
                <span className="min-w-0 break-words">{note.idea}</span>
                <span className="text-xs text-muted-foreground">{note.status === "note" ? "Kept as reference" : note.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
