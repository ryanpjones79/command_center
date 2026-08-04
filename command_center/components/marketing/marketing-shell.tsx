import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StickyCallCta } from "@/components/marketing/sticky-call-cta";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 -z-20 ambient-grid opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.2),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_24%),radial-gradient(circle_at_center_top,rgba(255,255,255,0.35),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.05),transparent_68%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_24%),radial-gradient(circle_at_center_top,rgba(255,255,255,0.05),transparent_25%),linear-gradient(180deg,rgba(15,23,42,0.52),transparent_72%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] -z-10 h-[30rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.18),transparent_60%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(16,185,129,0.12),transparent_60%)]" />
      <SiteHeader />
      <StickyCallCta />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
