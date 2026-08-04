import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Container } from "@/components/marketing/container";
import { Reveal } from "@/components/marketing/reveal";
import { siteContent } from "@/content/site-content";
import { buildMetadata } from "@/lib/marketing/metadata";

export const metadata = buildMetadata({
  title: "About",
  description:
    "Rykas is an Amazon growth and channel-control partner for brands that want stronger execution, cleaner operations, and more disciplined marketplace management.",
  path: "/about"
});

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="pb-10 pt-16 sm:pb-12 sm:pt-20">
        <Container className="max-w-5xl">
          <Reveal>
            <div className="max-w-4xl">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                About Rykas
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl lg:text-[4.2rem]">
                We believe Amazon should strengthen the brand, not destabilize it.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                Rykas is built around a simple premise: brands do not need more marketplace chaos. They need a stronger operating model, clearer execution, and a partner who treats Amazon like part of the broader business.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container className="grid gap-12 xl:grid-cols-[1.02fr_0.98fr] xl:items-start">
          <Reveal>
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">A note on how we think</p>
              <div className="mt-6 space-y-6 text-lg leading-9 text-foreground">
                <p>{siteContent.about.story}</p>
                <p>{siteContent.about.philosophy}</p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="rounded-[2.2rem] border border-border/70 bg-card/80 p-8 shadow-[0_20px_70px_rgba(15,23,42,0.08)] sm:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Operator mindset</p>
              <blockquote className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-4xl">
                "Amazon needs structure, not improvisation."
              </blockquote>
              <p className="mt-6 text-sm leading-7 text-muted-foreground">
                That mindset shapes how we approach listings, pricing, ads, inventory, seller control, and the broader relationship between Amazon and the rest of the brand.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container className="max-w-4xl">
          <Reveal>
            <div className="max-w-2xl">
              <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                Principles
              </p>
              <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                What brands are actually trusting us to do.
              </h2>
            </div>
          </Reveal>

          <div className="mt-10 border-t border-border/70">
            {siteContent.about.principles.map((principle, index) => (
              <Reveal delay={index * 0.05} key={principle}>
                <div className="grid gap-4 border-b border-border/70 py-6 md:grid-cols-[auto_1fr] md:gap-8 md:py-8">
                  <span className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">0{index + 1}</span>
                  <p className="max-w-3xl text-lg leading-8 text-foreground">{principle}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-24 sm:pb-32">
        <Container className="grid gap-10 xl:grid-cols-[0.86fr_1.14fr] xl:items-center">
          <Reveal>
            <div className="max-w-md">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Why brands work with us</p>
              <div className="mt-6 grid gap-4">
                {siteContent.whyChooseUs.map((item) => (
                  <div className="rounded-[1.5rem] border border-border/70 bg-card/75 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]" key={item.title}>
                    <p className="text-lg font-semibold text-foreground">{item.title}</p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="rounded-[2.2rem] border border-primary/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(245,158,11,0.08))] p-8 shadow-[0_22px_80px_rgba(16,185,129,0.1)] sm:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Next step</p>
              <h2 className="mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                If your brand wants Amazon handled with more structure, the next conversation should feel commercial, calm, and useful.
              </h2>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  className="premium-cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-sm font-semibold transition-all hover:-translate-y-0.5"
                  href="/assessment"
                >
                  Get Assessment
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
