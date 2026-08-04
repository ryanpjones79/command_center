import { Quote } from "lucide-react";
import { siteContent } from "@/content/site-content";

export function TestimonialGrid() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {siteContent.testimonials.map((testimonial) => (
        <article
          className="rounded-[1.75rem] border border-border/70 bg-card/80 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
          key={testimonial.quote}
        >
          <Quote className="h-6 w-6 text-primary" />
          <p className="mt-5 text-base leading-7 text-foreground">{testimonial.quote}</p>
          <div className="mt-6 border-t border-white/8 pt-4">
            <p className="text-sm font-semibold text-foreground">{testimonial.author}</p>
            <p className="mt-1 text-sm text-muted-foreground">{testimonial.role}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
