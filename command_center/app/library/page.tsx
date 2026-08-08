import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const workingNow = [
  {
    title: "Wisdom & Principles",
    description: "Capture distilled ideas and resurface active principles.",
    href: "/library/wisdom"
  },
  {
    title: "Season Archive",
    description: "See the current season and completed seasons by year.",
    href: "/library/seasons"
  },
  {
    title: "Notebook Index",
    description: "Find the physical page without turning the notebook into an app.",
    href: "/library/notebooks"
  },
  {
    title: "Parked Tasks",
    description: "Find real tasks that are intentionally not active right now.",
    href: "/tasks?whenBucket=PARKING_LOT"
  },
  {
    title: "Daily Brief",
    description: "Open the operational brief as a secondary reference tool.",
    href: "/daily-brief"
  },
  {
    title: "RyanOS Method",
    description: "Read the paper-to-digital operating method.",
    href: "/library/method"
  }
];

const comingLater = ["Reading Paths", "Parked Ideas"];

export default function LibraryPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Reference Shelf</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">Library</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Keep what deserves to be found again without turning every thought into a task.
        </p>
      </section>

      <section className="grid items-stretch gap-4 md:grid-cols-3">
        {workingNow.map((destination) => (
          <Card className="flex h-full flex-col bg-card/90" key={destination.href}>
            <CardHeader>
              <CardTitle>{destination.title}</CardTitle>
              <CardDescription>{destination.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild className="w-full">
                <Link href={destination.href}>Open {destination.title}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border bg-card/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Coming Later</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {comingLater.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      </section>
    </main>
  );
}
