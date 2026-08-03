"use client";

type MorningCardProps = {
  blockTypes: string[];
  buildNeedsRecipient: boolean;
  buildRecipient: string;
  decisionRule: string;
  decisionRules: string[];
  hasEightyPercentItem: boolean;
  needleMove: string;
  presenceIntention: string;
  rykasBacklog: string;
  setBuildRecipient: (value: string) => void;
  setDecisionRule: (value: string) => void;
  setHasEightyPercentItem: (value: boolean) => void;
  setNeedleMove: (value: string) => void;
  setPresenceIntention: (value: string) => void;
  setRykasBacklog: (value: string) => void;
  setWayOfBeing: (value: string) => void;
  shouldWarnRykasBacklog: boolean;
  wayOfBeing: string;
  wayOfBeingOptions: string[];
};

export function MorningCard({
  blockTypes,
  buildNeedsRecipient,
  buildRecipient,
  decisionRule,
  decisionRules,
  hasEightyPercentItem,
  needleMove,
  presenceIntention,
  rykasBacklog,
  setBuildRecipient,
  setDecisionRule,
  setHasEightyPercentItem,
  setNeedleMove,
  setPresenceIntention,
  setRykasBacklog,
  setWayOfBeing,
  shouldWarnRykasBacklog,
  wayOfBeing,
  wayOfBeingOptions
}: MorningCardProps) {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border bg-slate-950 p-4 text-white shadow-sm sm:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(16,185,129,0.20),transparent_34%),radial-gradient(circle_at_95%_10%,rgba(245,158,11,0.14),transparent_28%)]" />
      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
            RyanOS decides what matters
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Today's Needle Move
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Write it as a completed result. Time blocking decides when it
            happens.
          </p>
          <textarea
            className="mt-4 min-h-[88px] w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
            onChange={(event) => setNeedleMove(event.target.value)}
            placeholder="Example: CCHCS draft sent to Maria for review."
            value={needleMove}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-300">
              Who needs my presence today?
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500"
                onChange={(event) => setPresenceIntention(event.target.value)}
                placeholder="Person, team, or relationship"
                value={presenceIntention}
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-300">
              How do I want to be today?
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500"
                onChange={(event) => setWayOfBeing(event.target.value)}
                placeholder="Type your own word"
                value={wayOfBeing}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {wayOfBeingOptions.map((option) => {
              const isSelected = wayOfBeing === option;

              return (
                <button
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    isSelected
                      ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100"
                      : "border-white/10 bg-white/[0.07] text-slate-300 hover:bg-white/10"
                  }`}
                  key={option}
                  onClick={() => setWayOfBeing(option)}
                  type="button"
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
            <select
              className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white"
              onChange={(event) => setDecisionRule(event.target.value)}
              value={decisionRule}
            >
              {decisionRules.map((rule) => (
                <option key={rule} value={rule}>
                  {rule}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500"
              onChange={(event) => setBuildRecipient(event.target.value)}
              placeholder="Named recipient, if build/artifact"
              value={buildRecipient}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {blockTypes.map((type) => (
              <span
                className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-xs text-slate-300"
                key={type}
              >
                {type}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Guardrails
          </p>
          <div className="mt-3 grid gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                checked={hasEightyPercentItem}
                className="h-4 w-4"
                onChange={(event) =>
                  setHasEightyPercentItem(event.target.checked)
                }
                type="checkbox"
              />
              I have something 80% done
            </label>
            <label className="grid gap-1 text-sm text-slate-300">
              Rykas backlog count
              <input
                className="h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white"
                inputMode="numeric"
                onChange={(event) => setRykasBacklog(event.target.value)}
                value={rykasBacklog}
              />
            </label>
            <div className="space-y-2 text-xs text-slate-300">
              {buildNeedsRecipient && (
                <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-2 text-amber-100">
                  Name the recipient or send this to Parking.
                </p>
              )}
              {shouldWarnRykasBacklog && (
                <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-2 text-amber-100">
                  Rykas backlog is 10+. Do not source. Ship, relist, or list
                  backlog first.
                </p>
              )}
              {hasEightyPercentItem && (
                <p className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-2 text-emerald-100">
                  Ship / kill / park the 80% item before adding new work.
                </p>
              )}
              {!buildNeedsRecipient &&
                !shouldWarnRykasBacklog &&
                !hasEightyPercentItem && (
                  <p className="text-slate-400">
                    No active guardrail warnings.
                  </p>
                )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
