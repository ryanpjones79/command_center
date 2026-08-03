"use client";

type MorningLaunchCardProps = {
  isComplete: boolean;
  onComplete: () => void;
  onExpand: () => void;
};

const steps = ["Read", "Write", "Decide"];

export function MorningLaunchCard({
  isComplete,
  onComplete,
  onExpand
}: MorningLaunchCardProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-[1.75rem] border border-emerald-300/20 bg-slate-950 text-white shadow-[0_18px_70px_rgba(2,6,23,0.34)] transition-all duration-300 ease-out ${
        isComplete ? "p-4 sm:p-5" : "p-5 sm:p-6"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(16,185,129,0.20),transparent_34%),radial-gradient(circle_at_95%_10%,rgba(245,158,11,0.14),transparent_28%)]" />
      <div className="relative">
        {isComplete ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                Morning Launch complete
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                {steps.map((step) => (
                  <span
                    className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1"
                    key={step}
                  >
                    {step}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              onClick={onExpand}
              type="button"
            >
              Expand
            </button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                Morning Launch
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Begin intentionally.
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                The notebook is your first workspace.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
                  Read
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Current Reading
                </p>
                <p className="mt-2 text-lg font-semibold">Bhagavad Gita</p>
                <p className="text-sm text-slate-300">Chapter 2</p>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Open the physical book.
                  <br />
                  Read slowly.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                  Write
                </p>
                <p className="mt-3 text-lg font-semibold">Take your notebook.</p>
                <p className="text-sm text-slate-300">Write for a few minutes.</p>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
                  <li>What deserves my attention today?</li>
                  <li>What can I release?</li>
                  <li>How do I want to show up?</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                  Decide
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Today&apos;s work happens away from this screen.
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  After you&apos;ve scheduled what matters...
                  <br />
                  Close RyanOS.
                </p>
                <button
                  className="mt-5 min-h-12 w-full rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  onClick={onComplete}
                  type="button"
                >
                  Continue to Today
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
