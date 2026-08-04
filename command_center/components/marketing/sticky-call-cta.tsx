import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function StickyCallCta() {
  return (
    <div className="pointer-events-none fixed bottom-7 right-7 z-40 hidden lg:block">
      <Link
        className="premium-cta pointer-events-auto inline-flex h-12 items-center gap-2.5 whitespace-nowrap rounded-full border border-emerald-200/30 px-6 text-sm font-semibold shadow-[0_20px_52px_rgba(15,23,42,0.18)] backdrop-blur transition-all hover:-translate-y-0.5"
        href="/contact#contact-form"
      >
        Book a Strategy Call
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
