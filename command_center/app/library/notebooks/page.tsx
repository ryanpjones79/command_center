import Link from "next/link";
import { NotebookEntryForm } from "@/components/library/notebook-entry-form";
import { NotebookEntryList } from "@/components/library/notebook-entry-list";
import { NotebookForm } from "@/components/library/notebook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNotebookTitle, formatNotebookMonth } from "@/lib/notebook-format";
import { notebookEntryTypes } from "@/lib/notebook-options";
import { requireUser } from "@/lib/session";
import { getNotebookIndexData } from "@/server/notebook-service";

type NotebookIndexPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatDate(value: Date | null) {
  if (!value) return "None";
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function NotebookIndexPage({ searchParams }: NotebookIndexPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const data = await getNotebookIndexData(user.id, {
    query: firstParam(params.q),
    notebookId: firstParam(params.notebookId),
    entryType: firstParam(params.entryType),
    domainId: firstParam(params.domainId),
    projectId: firstParam(params.projectId),
    date: firstParam(params.date)
  });

  const hasNotebooks = data.notebooks.length > 0;

  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Library
            </p>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight">Notebook Index</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Find the page. Do not transcribe the life.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/library">Back to Library</Link>
          </Button>
        </div>
      </section>

      {!hasNotebooks && (
        <section className="rounded-[1.75rem] border border-dashed bg-card/70 p-6">
          <p className="text-sm font-semibold">No notebooks.</p>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Your notebook is your primary thinking space.
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            RyanOS simply remembers where important things live.
          </p>
          <div className="mt-5 max-w-xl rounded-2xl border bg-background/35 p-4">
            <p className="mb-3 text-sm font-medium">Create your first notebook.</p>
            <NotebookForm />
          </div>
        </section>
      )}

      {hasNotebooks && (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="overflow-hidden bg-card/90">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Notebooks</CardTitle>
                  {data.activeNotebook && <Badge>Current Notebook</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.activeNotebook && (
                  <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                      Current Notebook
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold">
                      {formatNotebookTitle(data.activeNotebook)}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Started {formatNotebookMonth(data.activeNotebook.startedAt)}
                    </p>
                    {data.activeNotebook.description && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {data.activeNotebook.description}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  {data.notebooks.map((notebook) => (
                    <Link
                      className="rounded-2xl border bg-background/35 p-4 transition hover:border-primary/45 hover:bg-background/55"
                      href={`/library/notebooks?notebookId=${notebook.id}`}
                      key={notebook.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-semibold">{formatNotebookTitle(notebook)}</h3>
                          {notebook.title !== formatNotebookTitle(notebook) && (
                            <p className="mt-1 text-sm text-muted-foreground">{notebook.title}</p>
                          )}
                        </div>
                        {!notebook.completedAt && <Badge variant="outline">Open</Badge>}
                      </div>
                      <dl className="mt-4 grid gap-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Started:</dt>
                          <dd>{formatDate(notebook.startedAt)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Completed:</dt>
                          <dd>{formatDate(notebook.completedAt)}</dd>
                        </div>
                      </dl>
                      {notebook.description && (
                        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                          {notebook.description}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="h-fit bg-card/90">
              <CardHeader>
                <CardTitle className="text-base">Add Notebook</CardTitle>
              </CardHeader>
              <CardContent>
                <NotebookForm />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="h-fit bg-card/90">
              <CardHeader>
                <CardTitle className="text-base">Fast Index</CardTitle>
              </CardHeader>
              <CardContent>
                <NotebookEntryForm
                  activeNotebookId={data.activeNotebook?.id}
                  domains={data.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
                  notebooks={data.notebooks.map((notebook) => ({
                    id: notebook.id,
                    number: notebook.number,
                    title: notebook.title
                  }))}
                  projects={data.projects.map((project) => ({
                    id: project.id,
                    name: project.name,
                    domain: { name: project.domain.name }
                  }))}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card/90">
                <CardHeader>
                  <CardTitle className="text-base">Search</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-3" method="get">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={data.filters.query}
                        name="q"
                        placeholder="Search title, summary, page, notebook, area, project"
                      />
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={data.filters.dateInput}
                        name="date"
                        type="date"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={data.filters.notebookId}
                        name="notebookId"
                      >
                        <option value="">All notebooks</option>
                        {data.notebooks.map((notebook) => (
                          <option key={notebook.id} value={notebook.id}>
                            {formatNotebookTitle(notebook)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={data.filters.entryType}
                        name="entryType"
                      >
                        <option value="">All types</option>
                        {notebookEntryTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={data.filters.domainId}
                        name="domainId"
                      >
                        <option value="">All areas</option>
                        {data.domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={data.filters.projectId}
                        name="projectId"
                      >
                        <option value="">All projects</option>
                        {data.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit">Search Index</Button>
                      <Button asChild variant="outline">
                        <Link href="/library/notebooks">Clear</Link>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <NotebookEntryList entries={data.entries} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
