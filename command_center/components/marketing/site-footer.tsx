import Link from "next/link";
import { marketingNavigation, siteContent } from "@/content/site-content";
import { Container } from "@/components/marketing/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/8 bg-card/35">
      <Container className="grid gap-10 py-12 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">Rykas</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{siteContent.brand.name}</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">{siteContent.brand.description}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">Pages</p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            {marketingNavigation.map((item) => (
              <Link className="transition-colors hover:text-foreground" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">Connect</p>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <Link className="transition-colors hover:text-foreground" href="/assessment">
              Get an Amazon Channel Assessment
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/contact#contact-form">
              Book a Strategy Call
            </Link>
            <Link className="transition-colors hover:text-foreground" href={`mailto:${siteContent.brand.email}`}>
              {siteContent.brand.email}
            </Link>
            <p>{siteContent.brand.location}</p>
            <Link className="transition-colors hover:text-foreground" href="/login">
              Client Login
            </Link>
          </div>
        </div>
      </Container>

      <Container className="flex flex-col gap-3 border-t border-white/8 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Amazon launch, cleanup, and management for brands that want the channel handled with more control.</p>
        <p>Built for brands that need stronger execution, cleaner pricing discipline, and less marketplace disorder.</p>
      </Container>
    </footer>
  );
}
