import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/daily-brief", label: "Daily Brief" },
  { href: "/", label: "Action Sheet" },
  { href: "/weekly-review", label: "Weekly Review" },
  { href: "/time-blocks", label: "Time Blocks" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-container mx-auto min-h-screen max-w-7xl px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
      <header className="app-shell-header sticky top-0 z-40 mb-4 flex flex-col gap-3 rounded-lg border bg-card/90 p-3 shadow-sm backdrop-blur sm:static sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">Daily Action OS</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">Printable execution layer paired with your emailed Daily Brief</p>
        </div>
        <nav className="app-shell-nav -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:justify-end sm:gap-2 sm:overflow-visible sm:pb-0">
          {links.map((link) => (
            <Button className="h-9 shrink-0 px-3 text-xs sm:text-sm" variant="ghost" asChild key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
          <form action={logoutAction} className="shrink-0">
            <Button className="h-9 px-3 text-xs sm:text-sm" variant="outline" type="submit">
              Sign Out
            </Button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
