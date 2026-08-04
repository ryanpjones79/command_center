import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { AssessmentForm } from "@/components/marketing/assessment-form";
import { Container } from "@/components/marketing/container";
import { Reveal } from "@/components/marketing/reveal";
import { siteContent } from "@/content/site-content";
import { buildMetadata } from "@/lib/marketing/metadata";

export const metadata = buildMetadata({
  title: "Amazon Channel Assessment",
  description:
    "Share a few details about your brand and current Amazon situation to start a focused conversation around launch, cleanup, or ongoing management.",
  path: "/assessment"
});

const whoItsFor = [
  "Brands evaluating a serious Amazon launch",
  "Brands dealing with multiple sellers or pricing drift",
  "Teams that need outside Amazon execution without building a large internal function"
] as const;

export default function AssessmentPage() {
  return (
    <MarketingShell>
      <section className="pb-10 pt-16 sm:pb-12 sm:pt-20">
        <Container className="max-w-4xl">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Amazon Channel Assessment
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
                Get an Amazon Channel Assessment
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Share a few details about your brand and current Amazon situation. We will use the intake to frame the right next conversation around launch, cleanup, or ongoing management.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-24 sm:pb-32">
        <Container className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Reveal>
            <div className="premium-surface rounded-[2.2rem] border border-border/70 p-7 shadow-[0_22px_80px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="max-w-2xl">
                <div className="flex flex-wrap gap-2">
                  {siteContent.assessment.signals.map((signal) => (
                    <span className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs font-medium text-foreground" key={signal}>
                      {signal}
                    </span>
                  ))}
                </div>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">Short intake. Clear next step.</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  The form is the focal point here. It helps us understand where Amazon stands today and what kind of support is likely to help first.
                </p>
              </div>
              <div className="mt-8" id="assessment-form">
                <AssessmentForm />
              </div>
            </div>
          </Reveal>

          <div className="grid gap-5 xl:pt-3">
            <Reveal delay={0.04}>
              <div className="rounded-[1.9rem] border border-border/70 bg-card/75 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">What it covers</p>
                <div className="mt-5 grid gap-3">
                  {siteContent.assessment.signals.map((signal) => (
                    <div className="flex gap-3 rounded-[1.3rem] border border-white/8 bg-background/80 p-4" key={signal}>
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                      <p className="text-sm leading-7 text-foreground">{signal}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="rounded-[1.9rem] border border-border/70 bg-card/75 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Who it is for</p>
                <div className="mt-5 grid gap-3">
                  {whoItsFor.map((item) => (
                    <div className="rounded-[1.3rem] border border-white/8 bg-background/80 p-4 text-sm leading-7 text-foreground" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="rounded-[1.9rem] border border-primary/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(245,158,11,0.08))] p-6 shadow-[0_22px_80px_rgba(16,185,129,0.1)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Reassurance</p>
                <p className="mt-4 text-sm leading-7 text-foreground">{siteContent.assessment.reassurance}</p>
                <Link className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/contact#contact-form">
                  Prefer a strategy call instead?
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>
    </MarketingShell>
  );
}
