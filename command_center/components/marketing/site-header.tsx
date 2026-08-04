"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { marketingNavigation, siteContent } from "@/content/site-content";
import { Container } from "@/components/marketing/container";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/78 shadow-[0_10px_35px_rgba(15,23,42,0.05)] backdrop-blur-2xl">
      <Container className="flex min-h-[5.5rem] items-center justify-between gap-4">
        <Link className="group inline-flex items-center gap-3" href="/">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-[radial-gradient(circle_at_30%_20%,rgba(244,255,251,0.55),transparent_40%),linear-gradient(140deg,hsl(var(--primary)/0.32),rgba(17,24,39,0.35))] text-sm font-semibold text-foreground shadow-[0_18px_40px_rgba(16,185,129,0.16)]">
            R
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold tracking-wide text-foreground">{siteContent.brand.name}</span>
            <span className="block text-xs uppercase tracking-[0.24em] text-muted-foreground">Amazon growth and channel control</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {marketingNavigation.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground",
                  active && "premium-ghost text-foreground"
                )}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <Link
            className="premium-ghost inline-flex h-11 items-center justify-center rounded-full border border-border/70 px-5 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
            href="/login"
          >
            Client Login
          </Link>
          <Link
            className="premium-cta inline-flex h-12 items-center gap-2.5 whitespace-nowrap rounded-full border border-emerald-200/30 px-5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5"
            href="/assessment"
          >
            Get Assessment
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center gap-3 lg:hidden">
          <ThemeToggle />
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/80 text-foreground"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {menuOpen ? (
        <div className="border-t border-white/8 lg:hidden">
          <Container className="grid gap-2 py-4">
            {marketingNavigation.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  className={cn(
                    "rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-border/80 hover:bg-card/70 hover:text-foreground",
                    active && "border-border/80 bg-card/70 text-foreground"
                  )}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-2 grid gap-2">
              <Link
                className="premium-ghost inline-flex h-11 items-center justify-center rounded-full border border-border/80 text-sm font-semibold text-foreground"
                href="/login"
              >
                Client Login
              </Link>
              <Link
                className="premium-cta inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full px-5 text-sm font-semibold"
                href="/assessment"
              >
                Get Assessment
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-border/80 px-5 text-sm font-semibold text-foreground"
                href="/contact#contact-form"
              >
                Book a Strategy Call
              </Link>
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
