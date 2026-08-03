import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WorkAreasPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-[1.75rem] border bg-card/85 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Work</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">Areas</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Areas are currently managed with Projects so domains, projects, and their commitments stay together.
        </p>
      </section>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Manage Areas In Projects</CardTitle>
          <CardDescription>
            Use the existing Projects screen to add domains, review areas, and connect projects to their area.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/projects">Open Projects</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/work">Back to Work</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
