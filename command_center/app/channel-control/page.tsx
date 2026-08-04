import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Container } from "@/components/marketing/container";
import { Reveal } from "@/components/marketing/reveal";
import { siteContent } from "@/content/site-content";
import { buildMetadata } from "@/lib/marketing/metadata";

export const metadata = buildMetadata({
  title: "Amazon Cleanup & Channel Control",
  description:
    "Bring more structure to a messy Amazon channel with better marketplace oversight, stronger listings, clearer pricing discipline, and more controlled execution.",
  path: "/channel-control"
});

const channelStates = {
  before: ["Pricing drift", "Too many sellers", "Weak listings", "Internal overload"],
  after: ["Cleaner control", "Stronger representation", "Better pricing discipline", "Less channel friction"]
} as const;

export default function ChannelControlPage() {
  return (
    <MarketingShell>
      <section className="pb-14 pt-16 sm:pb-16 sm:pt-20">
        <Container>
          <Reveal>
            <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-950 text-slate-50 shadow-[0_30px_100px_rgba(2,6,23,0.32)]">
              <div className="grid gap-10 p-8 sm:p-10 xl:grid-cols-[0.82fr_1.18fr] xl:items-start">
                <div>
                  <p className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
                    Amazon Cleanup / Channel Control
                  </p>
                  <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                    When Amazon feels out of control, the channel needs structure.
                  </h1>
                  <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
                    This page is diagnostic by design. It is built for brands dealing with pricing drift, too many sellers, weak execution, or a marketplace that no longer reflects the brand well.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link
                      className="premium-cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
                      href="/contact#contact-form"
                    >
                      Book a Strategy Call
                    </Link>
                    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-white" href="/assessment">
                      Start with assessment
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-[1.8rem] border border-white/10 bg-white/5 p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Before</p>
                    <div className="mt-5 grid gap-3">
                      {channelStates.before.map((item) => (
                        <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4 text-sm text-slate-100" key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.8rem] border border-emerald-400/20 bg-emerald-400/10 p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">After</p>
                    <div className="mt-5 grid gap-3">
                      {channelStates.after.map((item) => (
                        <div className="rounded-[1.2rem] border border-emerald-300/20 bg-slate-950/40 p-4 text-sm text-white" key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <Reveal>
            <div className="rounded-[2rem] border border-border/70 bg-card/80 p-7 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Signs the channel is out of control
              </p>
              <div className="mt-6 grid gap-4">
                {siteContent.cleanupPage.painPoints.map((painPoint) => (
                  <div className="rounded-[1.35rem] border border-white/8 bg-background/80 p-4 text-sm leading-7 text-foreground" key={painPoint}>
                    {painPoint}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="grid gap-4">
            {siteContent.cleanupPage.outcomes.map((outcome, index) => (
              <Reveal delay={index * 0.05} key={outcome}>
                <div className="rounded-[1.7rem] border border-border/70 bg-card/80 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Desired outcome</p>
                  <p className="mt-4 text-lg font-semibold tracking-tight text-foreground">{outcome}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <Reveal>
            <div className="max-w-xl">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                What we fix
              </p>
              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                The work usually starts with a diagnostic, then moves into cleanup and control.
              </h2>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5">
            {siteContent.cleanupPage.approach.map((step, index) => (
              <Reveal delay={index * 0.04} key={step.title}>
                <article className="grid gap-5 rounded-[1.9rem] border border-border/70 bg-card/80 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] lg:grid-cols-[0.22fr_0.78fr]">
                  <div className="rounded-[1.5rem] border border-white/8 bg-background/80 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Step 0{index + 1}</p>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{step.title}</h3>
                  </div>
                  <div className="rounded-[1.5rem] border border-primary/20 bg-primary/8 p-5">
                    <p className="text-sm leading-7 text-foreground">{step.description}</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Get control back</p>
              <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                If Amazon has become too messy for the brand to manage comfortably, the next step is a focused channel assessment.
              </h2>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="premium-cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
                  href="/assessment"
                >
                  Get an Amazon Channel Assessment
                </Link>
                <Link className="inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/contact#contact-form">
                  Book a Strategy Call
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
