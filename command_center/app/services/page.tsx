import Link from "next/link";
import { ArrowRight, Boxes, BriefcaseBusiness, Crown, Megaphone, ShieldCheck, Sparkles, Store, Tags } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Container } from "@/components/marketing/container";
import { Reveal } from "@/components/marketing/reveal";
import { siteContent } from "@/content/site-content";
import { buildMetadata } from "@/lib/marketing/metadata";

export const metadata = buildMetadata({
  title: "Services",
  description:
    "Amazon services for brands including launch strategy, listing optimization, advertising management, channel cleanup, inventory coordination, and ongoing marketplace support.",
  path: "/services"
});

const icons = [Store, Sparkles, ShieldCheck, Megaphone, Tags, Boxes, BriefcaseBusiness, Crown];
const spans = ["xl:col-span-5", "xl:col-span-3", "xl:col-span-4", "xl:col-span-4", "xl:col-span-3", "xl:col-span-5", "xl:col-span-7", "xl:col-span-5"];
const surfaces = [
  "premium-surface",
  "bg-[linear-gradient(165deg,rgba(16,185,129,0.08),rgba(255,255,255,0.88))] dark:bg-[linear-gradient(165deg,rgba(16,185,129,0.12),rgba(15,23,42,0.78))]",
  "bg-[linear-gradient(160deg,rgba(245,158,11,0.08),rgba(255,255,255,0.9))] dark:bg-[linear-gradient(160deg,rgba(245,158,11,0.1),rgba(15,23,42,0.76))]",
  "bg-[linear-gradient(160deg,rgba(15,23,42,0.04),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(160deg,rgba(30,41,59,0.88),rgba(15,23,42,0.8))]"
] as const;

const engagementModel = [
  "Assess the current channel and brand priorities",
  "Prioritize the highest-value work first",
  "Execute with tighter operational discipline",
  "Stabilize the channel around a stronger long-term model"
] as const;

export default function ServicesPage() {
  return (
    <MarketingShell>
      <section className="pb-12 pt-16 sm:pb-14 sm:pt-20">
        <Container className="grid gap-8 xl:grid-cols-[0.76fr_1.24fr] xl:items-end">
          <Reveal>
            <div className="max-w-xl">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Services
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
                Capabilities built around how brands actually need Amazon supported.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
                Less narrative, more structure. Launch, cleanup, listings, ads, inventory coordination, and ongoing channel management.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Launch support", "Channel cleanup", "Listings and content", "Ongoing management"].map((item, index) => (
                <div
                  className="rounded-[1.5rem] border border-border/70 bg-card/75 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)]"
                  key={item}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">0{index + 1}</p>
                  <p className="mt-3 text-lg font-semibold text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-12">
            {siteContent.services.map((service, index) => {
              const Icon = icons[index];
              const surface = surfaces[index % surfaces.length];

              return (
                <Reveal className={spans[index] ?? "xl:col-span-4"} delay={index * 0.03} key={service.slug}>
                  <article
                    className={`${surface} flex h-full flex-col rounded-[2rem] border border-border/70 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full border border-white/10 bg-background/75 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        Capability
                      </span>
                    </div>

                    <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{service.name}</h2>

                    <div className="mt-6 grid gap-4">
                      <div className="rounded-[1.35rem] border border-white/8 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">What it is</p>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">{service.summary}</p>
                      </div>

                      <div className="rounded-[1.35rem] border border-white/8 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Who it is for</p>
                        <p className="mt-2 text-sm leading-7 text-foreground">{service.audience}</p>
                      </div>

                      <div className="rounded-[1.35rem] border border-primary/20 bg-primary/10 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Outcome</p>
                        <p className="mt-2 text-sm leading-7 text-foreground">{service.outcome}</p>
                      </div>
                    </div>

                    <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary" href="/assessment">
                      {service.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="pb-24 sm:pb-32">
        <Container>
          <Reveal>
            <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-slate-950 text-slate-50 shadow-[0_28px_90px_rgba(2,6,23,0.28)]">
              <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">Engagement model</p>
                  <h2 className="mt-4 max-w-xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    A structured way to move from channel noise to channel discipline.
                  </h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {engagementModel.map((step, index) => (
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5" key={step}>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">0{index + 1}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-100">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 px-8 py-5 sm:px-10">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    className="premium-cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
                    href="/assessment"
                  >
                    Get Assessment
                  </Link>
                  <Link className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white" href="/contact#contact-form">
                    Book a Strategy Call
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </MarketingShell>
  );
}
