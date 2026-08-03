import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const primaryDestinations = [
  {
    title: "Project Control",
    description: "Review project health, stale work, blocked items, and Top 3 focus.",
    href: "/weekly-review"
  },
  {
    title: "Daily Brief",
    description: "Generate, print, or send the operational brief.",
    href: "/daily-brief"
  },
  {
    title: "Action Sheet",
    description: "Open the secondary execution and print-oriented action surface.",
    href: "/dashboard"
  },
  {
    title: "Print Action Sheet",
    description: "Use the compact print route when paper is the output.",
    href: "/print/action-sheet"
  }
];

const comingLater = ["Daily shutdown history", "Guided Weekly Reset", "Monthly or seasonal review"];

export default function ReviewPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Loops And Decisions</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">Review</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Close the day, review the system, and choose what deserves attention next.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {primaryDestinations.map((destination) => (
          <Card className="bg-card/90" key={destination.href}>
            <CardHeader>
              <CardTitle>{destination.title}</CardTitle>
              <CardDescription>{destination.description}</CardDescription>
            </CardHeader>
            <CardContent>
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
