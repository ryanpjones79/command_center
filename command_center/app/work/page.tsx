import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const primaryDestinations = [
  {
    title: "Tasks",
    description: "Create, triage, schedule, park, or close next actions.",
    href: "/tasks"
  },
  {
    title: "Projects",
    description: "Maintain project status, next actions, and active focus.",
    href: "/projects"
  }
];

const secondaryDestinations = [
  { title: "Daily Brief", href: "/daily-brief" },
  { title: "Action Sheet", href: "/dashboard" },
  { title: "Print Action Sheet", href: "/print/action-sheet" }
];

export default function WorkPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Commitment Maintenance</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">Work</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Maintain commitments without turning maintenance into the day.
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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Secondary Tools</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {secondaryDestinations.map((destination) => (
            <Button asChild key={destination.href} variant="outline">
              <Link href={destination.href}>{destination.title}</Link>
            </Button>
          ))}
        </div>
      </section>
    </main>
  );
}
