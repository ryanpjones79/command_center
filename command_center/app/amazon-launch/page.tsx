import Link from "next/link";
import { ArrowRight, CircleCheckBig } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Container } from "@/components/marketing/container";
import { Reveal } from "@/components/marketing/reveal";
import { siteContent } from "@/content/site-content";
import { buildMetadata } from "@/lib/marketing/metadata";

export const metadata = buildMetadata({
  title: "Amazon Launch For Brands",
  description:
    "Launch your brand on Amazon with better structure, stronger listings, cleaner operations, and less channel risk.",
  path: "/amazon-launch"
});

const launchRoadmap = [
  {
    label: "01",
    title: "Set the channel role",
    description: "Define how Amazon should support DTC, retail, and the broader brand before execution begins."
  },
  {
    label: "02",
    title: "Build the listing foundation",
    description: "Create stronger product pages, cleaner catalog structure, and clearer content standards."
  },
  {
    label: "03",
    title: "Align inventory and advertising",
    description: "Make launch execution feel stable by linking inventory, ads, and channel goals."
  },
  {
    label: "04",
    title: "Guide the early growth phase",
    description: "Tighten performance, protect control, and keep the channel from drifting into avoidable disorder."
  }
] as const;

export default function AmazonLaunchPage() {
  return (
    <MarketingShell>
      <section className="pb-14 pt-16 sm:pb-16 sm:pt-20">
        <Container className="grid gap-12 xl:grid-cols-[0.76fr_1.24fr] xl:items-start">
          <Reveal>
            <div className="max-w-xl">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Amazon Launch For Brands
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
                Launch Amazon like a real channel from day one.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
                This page is about process, not hype. The right launch model protects pricing, presentation, and future control.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="premium-cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
                  href="/contact#contact-form"
                >
                  Book a Strategy Call
                </Link>
                <Link className="inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/assessment">
                  Start with assessment
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="relative overflow-hidden rounded-[2.4rem] border border-border/70 bg-card/80 p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="absolute left-11 top-16 bottom-16 hidden w-px bg-gradient-to-b from-primary/20 via-primary/50 to-transparent sm:block" />
              <div className="relative grid gap-5">
                {launchRoadmap.map((step) => (
                  <div className="grid gap-4 rounded-[1.6rem] border border-white/8 bg-background/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:grid-cols-[auto_1fr]" key={step.title}>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                      {step.label}
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{step.title}</p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container className="grid gap-5 md:grid-cols-3">
          {siteContent.launchPage.whyAmazon.map((card, index) => (
            <Reveal delay={index * 0.05} key={card.title}>
              <article className="rounded-[1.8rem] border border-border/70 bg-card/75 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Why launch matters</p>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{card.title}</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{card.description}</p>
              </article>
            </Reveal>
          ))}
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <Reveal>
            <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-slate-950 text-slate-50 shadow-[0_28px_90px_rgba(2,6,23,0.28)]">
              <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">Launch mistakes to avoid</p>
                  <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Most launch problems start before the first month on Amazon.
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {siteContent.launchPage.mistakes.map((mistake) => (
                    <div className="rounded-[1.45rem] border border-white/10 bg-white/5 p-5" key={mistake}>
                      <p className="text-sm leading-7 text-slate-100">{mistake}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20 sm:pb-28">
        <Container className="grid gap-10 xl:grid-cols-[0.72fr_1.28fr]">
          <Reveal>
            <div className="max-w-md">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Launch framework
              </p>
              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                A phased roadmap for launching with more discipline.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                The launch framework is designed to keep strategy, listings, advertising, and operations moving in the same direction.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-5">
            {siteContent.launchPage.process.map((step, index) => (
              <Reveal delay={index * 0.04} key={step.title}>
                <article className="relative overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/80 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
                  <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-foreground">{step.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-muted-foreground">{step.description}</p>
                    </div>
                    <div className="rounded-full border border-border/70 bg-background/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Phase {index + 1}
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-24 sm:pb-32">
        <Container>
          <Reveal>
            <div className="rounded-[2rem] border border-primary/20 bg-[linear-gradient(140deg,rgba(16,185,129,0.18),rgba(245,158,11,0.08))] p-8 sm:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Clean launch standard</p>
              <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                The goal is not just to get on Amazon. It is to get on Amazon with stronger structure from the start.
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {siteContent.launchPage.cleanLaunch.map((item) => (
                  <div className="flex gap-3 rounded-[1.4rem] border border-white/8 bg-background/80 p-4" key={item}>
                    <CircleCheckBig className="mt-0.5 h-5 w-5 text-primary" />
                    <p className="text-sm leading-7 text-foreground">{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="premium-cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
                  href="/contact#contact-form"
                >
                  Book a Strategy Call
                </Link>
                <Link className="inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/assessment">
                  Get an Amazon Channel Assessment
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </MarketingShell>
  );
}
