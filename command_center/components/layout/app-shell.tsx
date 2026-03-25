import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/daily-brief", label: "Daily Brief" },
  { href: "/", label: "Action Sheet" },
  { href: "/weekly-review", label: "Weekly Review" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-container mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="app-shell-header mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/70 p-4 backdrop-blur">
        <div>
          <h1 className="text-xl font-semibold">Daily Action OS</h1>
          <p className="text-sm text-muted-foreground">Printable execution layer paired with your emailed Daily Brief</p>
        </div>
        <nav className="app-shell-nav flex items-center gap-2">
          {links.map((link) => (
            <Button variant="ghost" asChild key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
          <form action={logoutAction}>
            <Button variant="outline" type="submit">
              Sign Out
            </Button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
