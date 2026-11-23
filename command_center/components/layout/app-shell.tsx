"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarRange, ChevronDown, Feather, FolderKanban, Inbox, LayoutGrid, LogOut, Moon, Plus, Search, Settings, Sun, X, Zap, type LucideIcon } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { CaptureBox } from "@/components/inbox/capture-box";
import { WisdomQuickCapture } from "@/components/library/wisdom-quick-capture";
import { cn } from "@/lib/utils";
import {
  getActiveRyanOsNavKey,
  primaryRyanOsNavItems,
  secondaryRyanOsNavItems
} from "@/lib/route-decisions";
import type { ToolLink } from "@/lib/v2/tools";

type ShellProps = { children: React.ReactNode; inboxCount?: number; tools?: ToolLink[] };

const NAV_ICONS: Record<string, LucideIcon> = { now: Zap, today: CalendarRange, projects: FolderKanban, inbox: Inbox };

function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={cn("relative flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-violet-500 text-white shadow-[0_6px_20px_-6px_rgba(52,211,153,0.7)]", size === "md" ? "h-9 w-9" : "h-8 w-8")}>
      <Feather aria-hidden="true" className={size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4"} />
    </span>
  );
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try {
      window.localStorage.setItem("ryanos-theme", next ? "dark" : "light");
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
    setDark(next);
  }
  return (
    <button aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", focusRing, className)} onClick={toggle} type="button">
      {dark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}

function CaptureDialog({ trigger }: { trigger: React.ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-xl rounded-2xl border bg-card p-5 shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Capture</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                Just the thought. RyanOS files it and brings it back for a decision.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className={cn("rounded-lg p-1.5 text-muted-foreground hover:text-foreground", focusRing)}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4">
            <CaptureBox autoFocus />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Paper or a screenshot? Use <Link className="font-medium text-foreground underline underline-offset-4" href="/inbox/capture">photo capture</Link>.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ToolsList({ tools, tone }: { tools: ToolLink[]; tone: "sidebar" | "surface" }) {
  return (
    <ul className="space-y-0.5">
      {tools.map((tool) => (
        <li key={tool.key}>
          {tool.href ? (
            <a
              className={cn(
                "flex items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-sm",
                tone === "sidebar" ? "text-sidebar-foreground/90 hover:bg-white/5" : "hover:bg-muted",
                focusRing
              )}
              href={tool.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span>{tool.label}</span>
              <span className={cn("truncate text-[11px]", tone === "sidebar" ? "text-sidebar-muted" : "text-muted-foreground")}>{tool.note}</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className={cn("flex items-baseline justify-between gap-2 px-3 py-2 text-sm", tone === "sidebar" ? "text-sidebar-muted" : "text-muted-foreground")}>
              <span>{tool.label}</span>
              <span className="text-[11px]">Not configured</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Tools (external apps) and the secondary pages, as a sheet. Used by the phone header and the Plan icon strip.
function ToolsAndMore({ tools, trigger }: { tools: ToolLink[]; trigger: React.ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-foreground shadow-xl lg:inset-x-auto lg:bottom-4 lg:left-[5rem] lg:top-4 lg:max-h-none lg:w-80 lg:rounded-2xl lg:pb-5">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">Tools and more</Dialog.Title>
            <Dialog.Close aria-label="Close" className={cn("rounded-lg p-2 text-muted-foreground", focusRing)}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tools</p>
          <div className="mt-1"><ToolsList tone="surface" tools={tools} /></div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">More</p>
          <ul className="mt-1 space-y-0.5">
            {secondaryRyanOsNavItems.map((item) => (
              <li key={item.href}>
                <Dialog.Close asChild>
                  <Link className={cn("block rounded-lg px-3 py-2.5 text-sm hover:bg-muted", focusRing)} href={item.href}>{item.label}</Link>
                </Dialog.Close>
              </li>
            ))}
          </ul>
          <div className="mt-3 px-1">
            <WisdomQuickCapture />
          </div>
          <div className="mt-4 flex items-center gap-2 border-t pt-3">
            <Link aria-label="Settings" className={cn("inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm", focusRing)} href="/settings">
              <Settings aria-hidden="true" className="h-4 w-4" /> Settings
            </Link>
            <ThemeToggle className="border" />
            <form action={logoutAction} className="ml-auto">
              <button className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm", focusRing)} type="submit">Sign Out</button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AppShell({ children, inboxCount = 0, tools = [] }: ShellProps) {
  const pathname = usePathname();
  const activeKey = getActiveRyanOsNavKey(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Plan is calendar first: the sidebar shrinks to an icon strip and the page uses the full width.
  const rail = Boolean(pathname?.startsWith("/plan"));
  const railButton = cn("relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-sidebar-foreground", focusRing);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop icon strip (Plan) */}
      {rail && (
        <aside className="sticky top-0 hidden h-screen w-[4.25rem] shrink-0 flex-col items-center gap-2 border-r border-white/5 bg-sidebar py-4 text-sidebar-foreground lg:flex">
          <Link aria-label="RyanOS home" className={cn("mb-3 rounded-xl", focusRing)} href="/now" title="RyanOS">
            <LogoMark />
          </Link>
          <CaptureDialog
            trigger={
              <button aria-label="Capture" className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground", focusRing)} title="Capture" type="button">
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
            }
          />
          <Link aria-label="Search" className={railButton} href="/search" title="Search">
            <Search aria-hidden="true" className="h-4 w-4" />
          </Link>
          <nav aria-label="Primary" className="mt-3 flex flex-col items-center gap-1.5">
            {primaryRyanOsNavItems.map((item) => {
              const active = activeKey === item.key;
              const Icon = NAV_ICONS[item.key] ?? Zap;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={cn(railButton, "h-11 w-11", active && "bg-white/[0.08] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]")}
                  href={item.href}
                  key={item.href}
                  title={item.label}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  {item.key === "inbox" && inboxCount > 0 && (
                    <span aria-label={`${inboxCount} need a decision`} className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{inboxCount}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <ToolsAndMore
            tools={tools}
            trigger={
              <button aria-label="Tools and more" className={cn(railButton, "mt-3 h-11 w-11 border border-white/10")} title="Tools and more" type="button">
                <LayoutGrid aria-hidden="true" className="h-5 w-5" />
              </button>
            }
          />
          <div className="mt-auto flex flex-col items-center gap-1 border-t border-white/10 pt-3">
            <Link aria-label="Settings" className={railButton} href="/settings" title="Settings">
              <Settings aria-hidden="true" className="h-4 w-4" />
            </Link>
            <ThemeToggle className="text-sidebar-foreground/75 hover:bg-white/[0.06]" />
            <form action={logoutAction}>
              <button aria-label="Sign out" className={railButton} title="Sign out" type="submit">
                <LogOut aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>
          </div>
        </aside>
      )}

      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-sidebar bg-[radial-gradient(420px_260px_at_0%_0%,rgba(52,211,153,0.10),transparent_70%),radial-gradient(360px_300px_at_100%_100%,rgba(139,92,246,0.10),transparent_70%)] px-3 py-5 text-sidebar-foreground", !rail && "lg:flex")}>
        <Link className={cn("mb-6 flex items-center gap-2 rounded-lg px-3", focusRing)} href="/now">
          <LogoMark />
          <span className="text-lg font-semibold tracking-tight">Ryan<span className="text-gradient">OS</span></span>
        </Link>

        <div className="mb-5 grid grid-cols-[1fr_auto] gap-2 px-1">
          <CaptureDialog
            trigger={
              <button className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-95", focusRing)} type="button">
                <Plus aria-hidden="true" className="h-4 w-4" /> Capture
              </button>
            }
          />
          <Link aria-label="Search" className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10", focusRing)} href="/search">
            <Search aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <nav aria-label="Primary" className="space-y-1">
          {primaryRyanOsNavItems.map((item) => {
            const active = activeKey === item.key;
            const Icon = NAV_ICONS[item.key] ?? Zap;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center justify-between rounded-xl px-3 text-[15px] font-medium transition-colors",
                  active ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-sidebar-foreground/75 hover:bg-white/[0.04] hover:text-sidebar-foreground",
                  focusRing
                )}
                href={item.href}
                key={item.href}
              >
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-emerald-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />}
                <span className="flex items-center gap-3">
                  <Icon aria-hidden="true" className={cn("h-[18px] w-[18px]", active ? "text-emerald-300" : "text-sidebar-muted")} />
                  {item.label}
                </span>
                {item.key === "inbox" && inboxCount > 0 && (
                  <span aria-label={`${inboxCount} need a decision`} className="rounded-full bg-primary/90 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    {inboxCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 space-y-1 overflow-y-auto">
          <button aria-expanded={toolsOpen} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-muted hover:text-sidebar-foreground", focusRing)} onClick={() => setToolsOpen((v) => !v)} type="button">
            Tools <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform", toolsOpen && "rotate-180")} />
          </button>
          {toolsOpen && <ToolsList tone="sidebar" tools={tools} />}
          <button aria-expanded={moreOpen} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-muted hover:text-sidebar-foreground", focusRing)} onClick={() => setMoreOpen((v) => !v)} type="button">
            More <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
          </button>
          {moreOpen && (
            <ul className="space-y-0.5">
              {secondaryRyanOsNavItems.map((item) => (
                <li key={item.href}>
                  <Link className={cn("block rounded-lg px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-white/5", focusRing)} href={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="px-2 pt-1">
                <WisdomQuickCapture />
              </li>
            </ul>
          )}
        </div>

        <div className="mt-auto flex items-center gap-1 border-t border-white/10 pt-3">
          <Link aria-label="Settings" className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/5", focusRing)} href="/settings" title="Settings">
            <Settings aria-hidden="true" className="h-4 w-4" />
          </Link>
          <ThemeToggle className="hover:bg-white/5" />
          <form action={logoutAction} className="ml-auto">
            <button className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground", focusRing)} type="submit">
              <LogOut aria-hidden="true" className="h-4 w-4" /> Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background/75 px-4 py-2.5 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <Link className={cn("mr-auto flex items-center gap-2 rounded-lg", focusRing)} href="/now">
          <LogoMark size="sm" />
          <span className="text-base font-semibold tracking-tight">Ryan<span className="text-gradient">OS</span></span>
        </Link>
        <CaptureDialog
          trigger={
            <button className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground", focusRing)} type="button">
              <Plus aria-hidden="true" className="h-4 w-4" /> Capture
            </button>
          }
        />
        <Link aria-label="Search" className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl border", focusRing)} href="/search">
          <Search aria-hidden="true" className="h-4 w-4" />
        </Link>
        <ToolsAndMore
          tools={tools}
          trigger={
            <button aria-label="Tools and more" className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl border", focusRing)} type="button">
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </button>
          }
        />
      </header>

      <main className={cn("min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-12", rail ? "lg:px-6 lg:pt-5" : "lg:px-10 lg:pt-8")}>
        <div className={cn("mx-auto w-full", rail ? "max-w-[1600px]" : "max-w-5xl")}>{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav aria-label="Mobile primary" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-[1.4rem] border border-white/10 bg-sidebar/85 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-sidebar-foreground shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        {primaryRyanOsNavItems.map((item) => {
          const active = activeKey === item.key;
          const Icon = NAV_ICONS[item.key] ?? Zap;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn("relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] font-medium", active ? "bg-white/[0.08] text-white" : "text-sidebar-foreground/65", focusRing)}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" className={cn("h-5 w-5", active ? "text-emerald-300" : "")} />
              {item.label}
              {item.key === "inbox" && inboxCount > 0 && (
                <span aria-label={`${inboxCount} need a decision`} className="absolute right-2 top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{inboxCount}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
