import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatNotebookEntryType } from "@/lib/notebook-options";
import { formatNotebookTitle } from "@/lib/notebook-format";

type NotebookEntryListItem = {
  id: string;
  date: Date | null;
  pageNumber: number;
  title: string;
  entryType: string;
  summary: string | null;
  notebook: { number: number | null; title: string };
  domain: { name: string } | null;
  project: { id: string; name: string } | null;
};

function formatEntryDate(value: Date | null) {
  if (!value) return "No date";
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function NotebookEntryList({ entries }: { entries: NotebookEntryListItem[] }) {
  if (entries.length === 0) {
    return (
      <Card className="border-dashed bg-card/55">
        <CardContent className="space-y-2 pt-6">
          <p className="text-sm font-medium">No notebook entries found.</p>
          <p className="text-sm text-muted-foreground">
            Index a page or loosen the filters. RyanOS only needs enough metadata to find the paper again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {entries.map((entry) => (
        <article
          className="rounded-2xl border bg-card/85 p-4 shadow-sm transition hover:border-primary/40"
          key={entry.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatNotebookTitle(entry.notebook)}</span>
                <span>Page {entry.pageNumber}</span>
                <span>{formatEntryDate(entry.date)}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{entry.title}</h3>
            </div>
            <Badge variant="secondary">{formatNotebookEntryType(entry.entryType)}</Badge>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Linked Project
              </p>
              {entry.project ? (
                <Link className="mt-1 inline-flex text-primary underline-offset-4 hover:underline" href="/projects">
                  {entry.project.name}
                </Link>
              ) : (
                <p className="mt-1 text-muted-foreground">None</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Area
              </p>
              <p className="mt-1">{entry.domain?.name ?? "None"}</p>
            </div>
          </div>

          {entry.summary && (
            <div className="mt-4 rounded-xl border border-border/60 bg-background/35 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Summary
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
