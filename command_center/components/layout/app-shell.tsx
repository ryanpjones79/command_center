"use client";

import Link from "next/link";
import { Bot, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { WisdomQuickCapture } from "@/components/library/wisdom-quick-capture";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getActiveRyanOsNavKey,
  primaryRyanOsNavItems
} from "@/lib/route-decisions";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = getActiveRyanOsNavKey(pathname);

  return (
    <div className="app-shell-container mx-auto min-h-screen max-w-7xl px-3 pb-28 pt-3 sm:px-6 sm:py-6 lg:px-8">
      <header className="app-shell-header sticky top-0 z-40 mb-4 rounded-2xl border bg-card/90 p-3 shadow-sm backdrop-blur sm:static sm:mb-6 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:p-4">
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
        <div className="mt-3 flex items-center justify-end gap-2 sm:mt-0">
          <nav
            aria-label="Primary"
            className="app-shell-nav hidden items-center gap-1 sm:flex sm:flex-wrap sm:justify-end sm:gap-2"
          >
            {primaryRyanOsNavItems.map((link) => {
              const isActive = activeKey === link.key;

              return (
                <Button
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "h-9 shrink-0 px-3 text-xs sm:text-sm",
                    isActive && "bg-primary/12 text-primary ring-1 ring-primary/30"
                  )}
                  variant="ghost"
                  asChild
                  key={link.href}
                >
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              );
            })}
          </nav>
          <Button
            aria-current={pathname?.startsWith("/agent-hq") ? "page" : undefined}
            className={cn(
              "h-9 shrink-0 px-3 text-xs sm:text-sm",
              pathname?.startsWith("/agent-hq") && "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30"
            )}
            variant="outline"
            asChild
          >
            <Link href="/agent-hq"><Bot aria-hidden="true" className="mr-1.5 h-4 w-4" /> Agent HQ</Link>
          </Button>
          <WisdomQuickCapture />
          <Button
            aria-label="Settings"
            className="h-9 w-9 shrink-0 px-0"
            variant="outline"
            asChild
          >
            <Link href="/settings" title="Settings">
              <Settings aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
          <form action={logoutAction} className="hidden shrink-0 sm:block">
            <Button className="h-9 px-3 text-xs sm:text-sm" variant="outline" type="submit">
              Sign Out
            </Button>
          </form>
          <form action={logoutAction} className="shrink-0 sm:hidden">
            <Button className="h-9 px-3 text-xs" variant="outline" type="submit">
              Sign Out
            </Button>
          </form>
        </div>
      </header>
      {children}
      <nav
        aria-label="Mobile primary"
        className="bg-slate-950/92 fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 gap-1 rounded-[1.35rem] border border-white/10 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-white shadow-[0_18px_70px_rgba(2,6,23,0.5)] backdrop-blur sm:hidden"
      >
        {primaryRyanOsNavItems.map((link) => {
          const isActive = activeKey === link.key;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 py-1 text-center text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white",
                isActive && "bg-white/10 text-white"
              )}
              href={link.href}
              key={link.href}
            >
              <span
                className={cn(
                  "mb-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-emerald-200",
                  isActive && "bg-primary text-primary-foreground"
                )}
              >
                {link.mark}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
