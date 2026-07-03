import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/time-blocks", label: "RyanOS" },
  { href: "/daily-brief", label: "Daily Brief" },
  { href: "/", label: "Action Sheet" },
  { href: "/weekly-review", label: "Weekly Review" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" }
];

const mobileLinks = [
  { href: "/time-blocks", label: "Today", mark: "RY" },
  { href: "/daily-brief", label: "Brief", mark: "DB" },
  { href: "/", label: "Sheet", mark: "AS" },
  { href: "/tasks", label: "Tasks", mark: "TK" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-container mx-auto min-h-screen max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:py-6 lg:px-8">
      <header className="app-shell-header sticky top-0 z-40 mb-4 overflow-hidden rounded-2xl border bg-card/90 p-3 shadow-sm backdrop-blur sm:static sm:mb-6 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:hidden">
            Command Center
          </p>
          <h1 className="truncate text-lg font-semibold sm:text-xl">RyanOS</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Daily execution screen: decide what matters, then block when it
            happens
          </p>
        </div>
        <nav className="app-shell-nav -mx-1 mt-3 flex w-[calc(100%+0.5rem)] items-center gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-0 sm:w-auto sm:flex-wrap sm:justify-end sm:gap-2 sm:overflow-visible sm:pb-0">
          {links.map((link) => (
            <Button
              className="h-9 shrink-0 px-3 text-xs sm:text-sm"
              variant="ghost"
              asChild
              key={link.href}
            >
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
          <form action={logoutAction} className="shrink-0">
            <Button
              className="h-9 px-3 text-xs sm:text-sm"
              variant="outline"
              type="submit"
            >
              Sign Out
            </Button>
          </form>
        </nav>
      </header>
      {children}
      <nav className="bg-slate-950/92 fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 gap-1 rounded-[1.35rem] border border-white/10 p-1.5 text-white shadow-[0_18px_70px_rgba(2,6,23,0.5)] backdrop-blur sm:hidden">
        {mobileLinks.map((link) => (
          <Link
            className="flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 py-1 text-center text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            href={link.href}
            key={link.href}
          >
            <span className="mb-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-emerald-200">
              {link.mark}
            </span>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
