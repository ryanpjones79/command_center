import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Container } from "@/components/marketing/container";
import { ContactForm } from "@/components/marketing/contact-form";
import { Reveal } from "@/components/marketing/reveal";
import { siteContent } from "@/content/site-content";
import { buildMetadata } from "@/lib/marketing/metadata";

export const metadata = buildMetadata({
  title: "Contact",
  description:
    "Book a strategy call to discuss Amazon launch, channel cleanup, listings, advertising, or broader marketplace management for your brand.",
  path: "/contact"
});

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className="pb-10 pt-16 sm:pb-12 sm:pt-20">
        <Container className="max-w-4xl">
          <Reveal>
            <div className="max-w-2xl">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Contact
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
                Book a Strategy Call
              </h1>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Tell us whether the need is launch, cleanup, listings, ads, or ongoing management and we will use that context to make the conversation more useful.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-24 sm:pb-32">
        <Container className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <Reveal>
            <div className="rounded-[2rem] border border-border/70 bg-card/75 p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Scheduling</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">Add your booking embed here.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{siteContent.contact.calendarNote}</p>

              <div className="mt-6 rounded-[1.7rem] border border-dashed border-border/80 bg-background/80 p-6">
                <div className="grid gap-3">
                  <div className="h-3 w-32 rounded-full bg-foreground/10" />
                  <div className="h-3 w-48 rounded-full bg-foreground/10" />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="h-24 rounded-2xl border border-border/70 bg-card/80" />
                    <div className="h-24 rounded-2xl border border-border/70 bg-card/80" />
                    <div className="h-24 rounded-2xl border border-border/70 bg-card/80" />
                    <div className="h-24 rounded-2xl border border-border/70 bg-card/80" />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {["Launch support", "Cleanup", "Ongoing management"].map((item) => (
                  <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-foreground" key={item}>
                    {item}
                  </span>
                ))}
              </div>

              <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/assessment">
                Prefer a lighter first step? Get assessment
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="premium-surface rounded-[2.2rem] border border-border/70 p-7 shadow-[0_22px_80px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Quick intake</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">Share the context.</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Short, brand-facing, and designed to get the right conversation started without unnecessary friction.
                </p>
              </div>
              <div className="mt-8" id="contact-form">
                <ContactForm />
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </MarketingShell>
  );
}
