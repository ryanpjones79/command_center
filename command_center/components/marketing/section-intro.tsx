import { cn } from "@/lib/utils";

type SectionIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionIntro({ eyebrow, title, description, align = "left", className }: SectionIntroProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p className="inline-flex rounded-full border border-primary/12 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl lg:text-[2.85rem]">
        {title}
      </h2>
      <p className="mt-4 max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground sm:text-base">{description}</p>
    </div>
  );
}
