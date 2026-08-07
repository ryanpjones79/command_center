import Link from "next/link";
import {
  archiveWisdomAction,
  convertWisdomToParkedIdeaAction,
  createTaskFromWisdomAction,
  deleteWisdomAction,
  promoteInboxWisdomAction,
  toggleWisdomActiveAction,
  toggleWisdomFavoriteAction,
  updateWisdomEntryAction
} from "@/app/library/wisdom/actions";
import { WisdomEntryForm } from "@/components/library/wisdom-entry-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import {
  formatWisdomSourceType,
  parseWisdomTags,
  wisdomCategories,
  wisdomSourceTypes,
  wisdomStatuses
} from "@/lib/wisdom-options";
import { getWisdomLibraryData } from "@/server/wisdom-service";

type WisdomPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "No date";
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function dateInput(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function sectionHref(section: string) {
  return `/library/wisdom?section=${section}`;
}

export default async function WisdomPage({ searchParams }: WisdomPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const selectedEntryId = firstParam(params.entry);
  const data = await getWisdomLibraryData(
    user.id,
    {
      q: firstParam(params.q),
      section: firstParam(params.section),
      category: firstParam(params.category),
      sourceType: firstParam(params.sourceType)
    },
    selectedEntryId
  );
  const selected = data.selectedEntry;

  const sectionLinks = [
    { key: "inbox", label: "Inbox", count: data.counts.inbox },
    { key: "active", label: "Active", count: data.counts.active },
    { key: "favorites", label: "Favorites", count: data.counts.favorites },
    { key: "all", label: "All Wisdom", count: data.counts.library },
    { key: "archived", label: "Archived", count: data.counts.archived }
  ];

  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Library
            </p>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight">
              Wisdom & Principles
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Capture the few ideas worth carrying forward. Resurface them
              until they become part of daily life.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/library">Back to Library</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {sectionLinks.map((section) => (
          <Link
            className={`rounded-2xl border bg-card/80 p-4 transition hover:border-primary/40 ${
              data.filters.section === section.key
                ? "border-primary/40 bg-primary/10"
                : ""
            }`}
            href={sectionHref(section.key)}
            key={section.key}
          >
            <p className="text-sm font-semibold">{section.label}</p>
            <p className="mt-2 text-2xl font-semibold">{section.count}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="text-base">Fast Capture</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Use the global `+ Wisdom` button for one-field capture from
                anywhere. Use this form when the idea is already distilled.
              </p>
              <WisdomEntryForm />
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="text-base">Search</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" method="get">
                <input
                  name="section"
                  type="hidden"
                  value={data.filters.section}
                />
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={data.filters.q}
                  name="q"
                  placeholder="Search title, idea, takeaway, source, tags"
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={data.filters.category}
                  name="category"
                >
                  <option value="">All categories</option>
                  {wisdomCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={data.filters.sourceType}
                  name="sourceType"
                >
                  <option value="">All sources</option>
                  {wisdomSourceTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Search</Button>
                  <Button asChild variant="outline">
                    <Link href="/library/wisdom">Clear</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {selected && (
            <Card className="border-primary/30 bg-card/95">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                      Full Entry
                    </p>
                    <CardTitle className="mt-1">{selected.title}</CardTitle>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={toggleWisdomFavoriteAction.bind(null, selected.id)}>
                      <Button size="sm" type="submit" variant="outline">
                        {selected.favorite ? "Starred" : "Favorite"}
                      </Button>
                    </form>
                    <form action={toggleWisdomActiveAction.bind(null, selected.id)}>
                      <Button size="sm" type="submit" variant="outline">
                        {selected.active ? "Active" : "Keep Active"}
                      </Button>
                    </form>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border bg-background/35 p-4">
                  <p className="text-sm leading-6">{selected.idea}</p>
                  {selected.takeaway && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        My Takeaway:
                      </span>{" "}
                      {selected.takeaway}
                    </p>
                  )}
                  {selected.application && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        How I Can Use This:
                      </span>{" "}
                      {selected.application}
                    </p>
                  )}
                </div>

                {selected.photoUrl && (
                  <div className="rounded-2xl border bg-background/35 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Photo / Reference
                    </p>
                    <a
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      href={selected.photoUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open attached reference
                    </a>
                  </div>
                )}

                {selected.notebookEntry && (
                  <p className="text-sm text-muted-foreground">
                    Source notebook: {selected.notebookEntry.notebook.title} /
                    Page {selected.notebookEntry.pageNumber}
                  </p>
                )}

                <form action={updateWisdomEntryAction} className="grid gap-3">
                  <input name="wisdomId" type="hidden" value={selected.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium">
                      Title
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.title}
                        name="title"
                        required
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Category
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.category}
                        name="category"
                      >
                        {wisdomCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="grid gap-2 text-sm font-medium">
                    Main idea
                    <textarea
                      className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      defaultValue={selected.idea}
                      name="idea"
                      required
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium">
                      My Takeaway
                      <textarea
                        className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        defaultValue={selected.takeaway ?? ""}
                        name="takeaway"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      How I Can Use This
                      <textarea
                        className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        defaultValue={selected.application ?? ""}
                        name="application"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-2 text-sm font-medium">
                      Source type
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.sourceType}
                        name="sourceType"
                      >
                        {wisdomSourceTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Source
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.sourceName ?? ""}
                        name="sourceName"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Author/person
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.author ?? ""}
                        name="author"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="grid gap-2 text-sm font-medium">
                      Reference
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.reference ?? ""}
                        name="reference"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Captured
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={dateInput(selected.capturedAt)}
                        name="capturedAt"
                        type="date"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Status
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.status}
                        name="status"
                      >
                        {wisdomStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium">
                      Tags
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={selected.tags ?? ""}
                        name="tags"
                      />
                    </label>
                  </div>
                  <input
                    defaultValue={selected.photoUrl ?? ""}
                    name="photoUrl"
                    type="hidden"
                  />
                  <input
                    defaultValue={selected.notebookEntryId ?? ""}
                    name="notebookEntryId"
                    type="hidden"
                  />
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        className="h-4 w-4"
                        defaultChecked={selected.favorite}
                        name="favorite"
                        type="checkbox"
                      />
                      Favorite
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        className="h-4 w-4"
                        defaultChecked={selected.active}
                        name="active"
                        type="checkbox"
                      />
                      Active principle
                    </label>
                  </div>
                  <Button type="submit">Save Changes</Button>
                </form>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {selected.status === "inbox" && (
                    <form action={promoteInboxWisdomAction.bind(null, selected.id)}>
                      <Button type="submit">Promote to Principles Library</Button>
                    </form>
                  )}
                  <form action={createTaskFromWisdomAction.bind(null, selected.id)}>
                    <Button type="submit" variant="outline">
                      Create Task From This
                    </Button>
                  </form>
                  <form action={convertWisdomToParkedIdeaAction.bind(null, selected.id)}>
                    <Button type="submit" variant="outline">
                      Convert to Project/Idea
                    </Button>
                  </form>
                  <form action={archiveWisdomAction.bind(null, selected.id)}>
                    <Button type="submit" variant="outline">
                      Archive
                    </Button>
                  </form>
                  <form action={deleteWisdomAction.bind(null, selected.id)}>
                    <Button type="submit" variant="destructive">
                      Delete
                    </Button>
                  </form>
                </div>

                <div className="rounded-2xl border bg-background/35 p-4">
                  <p className="text-sm font-semibold">Reflections</p>
                  {selected.reflections.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No reflections yet.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {selected.reflections.map((reflection) => (
                        <p
                          className="rounded-xl border bg-card/65 p-3 text-sm text-muted-foreground"
                          key={reflection.id}
                        >
                          {reflection.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="text-base">
                {data.filters.section === "inbox"
                  ? "Wisdom Inbox"
                  : "Principles Library"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-background/35 p-6">
                  <p className="text-sm font-medium">No wisdom found.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Capture less. Keep only ideas worth seeing again.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {data.entries.map((entry) => {
                    const tags = parseWisdomTags(entry.tags);

                    return (
                      <article
                        className="rounded-2xl border bg-background/35 p-4 transition hover:border-primary/40"
                        key={entry.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              className="text-lg font-semibold tracking-tight text-foreground underline-offset-4 hover:underline"
                              href={`/library/wisdom?entry=${entry.id}&section=${data.filters.section}`}
                            >
                              {entry.title}
                            </Link>
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                              {entry.takeaway || entry.idea}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {entry.favorite && <Badge>Starred</Badge>}
                            {entry.active && <Badge variant="secondary">Active</Badge>}
                            {entry.status === "inbox" && <Badge variant="outline">Inbox</Badge>}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{entry.category}</span>
                          <span>{formatWisdomSourceType(entry.sourceType)}</span>
                          {entry.sourceName && <span>{entry.sourceName}</span>}
                          <span>{formatDate(entry.capturedAt)}</span>
                          {tags.slice(0, 3).map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <form action={toggleWisdomFavoriteAction.bind(null, entry.id)}>
                            <Button size="sm" type="submit" variant="outline">
                              {entry.favorite ? "Unstar" : "Favorite"}
                            </Button>
                          </form>
                          <form action={toggleWisdomActiveAction.bind(null, entry.id)}>
                            <Button size="sm" type="submit" variant="outline">
                              {entry.active ? "Deactivate" : "Keep Active"}
                            </Button>
                          </form>
                          {entry.status === "inbox" && (
                            <form action={promoteInboxWisdomAction.bind(null, entry.id)}>
                              <Button size="sm" type="submit" variant="outline">
                                Promote
                              </Button>
                            </form>
                          )}
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/library/wisdom?entry=${entry.id}`}>
                              Open
                            </Link>
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
