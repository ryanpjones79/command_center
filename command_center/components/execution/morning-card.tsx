"use client";

import { useState } from "react";

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

const decisionRuleDisplayLabels: Record<string, string> = {
  "CCHCS deadline / leadership-visible commitment within 48h":
    "Leadership-visible commitment",
  "SignalCare conversation available": "Revenue or pipeline action",
  "Anything 80% done and ready to ship": "Build or artifact ready to ship",
  "Otherwise pipeline block": "No special rule"
};

const primaryAreaLabels = ["CCHCS", "Pipeline", "Rykas", "Personal", "Admin"];
const advancedStatusLabels = ["Needle Move", "Parking"];

function getDecisionRuleDisplayLabel(rule: string) {
  return decisionRuleDisplayLabels[rule] ?? rule;
}

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
  const relationshipExamples = [
    "Daughter",
    "Coworker",
    "Customer",
    "Friend",
    "Myself"
  ];
  const [isCommitmentDetailsOpen, setIsCommitmentDetailsOpen] = useState(false);
  const [isFocusCheckOpen, setIsFocusCheckOpen] = useState(false);
  const hasActiveFocusCheck =
    buildNeedsRecipient || shouldWarnRykasBacklog || hasEightyPercentItem;
  const needsRecipientDetail = buildNeedsRecipient;
  const showCommitmentDetails =
    isCommitmentDetailsOpen ||
    needsRecipientDetail ||
    buildRecipient.trim().length > 0;
  const showFocusCheckDetails = hasActiveFocusCheck || isFocusCheckOpen;
  const primaryAreas = primaryAreaLabels.filter((label) =>
    blockTypes.includes(label)
  );
  const advancedStatuses = advancedStatusLabels.filter((label) =>
    blockTypes.includes(label)
  );

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-5 text-white shadow-[0_24px_90px_rgba(2,6,23,0.32)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(16,185,129,0.24),transparent_34%),radial-gradient(circle_at_92%_12%,rgba(245,158,11,0.16),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
            RyanOS decides what matters
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Today's Needle Move
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Write the result, not the activity. This is the center of the day.
          </p>
          <textarea
            aria-label="Today's Needle Move"
            className="mt-5 min-h-[132px] w-full rounded-[1.5rem] border border-white/10 bg-white/[0.08] px-5 py-4 text-base leading-7 text-slate-50 caret-emerald-200 outline-none placeholder:text-slate-500 selection:bg-emerald-300/25 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
            onChange={(event) => setNeedleMove(event.target.value)}
            placeholder="What completed result would make today meaningful?"
            value={needleMove}
          />
          {!needleMove.trim() && (
            <p className="mt-2 text-xs text-slate-500">
              Calm start: leave blank until the answer is honest.
            </p>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="font-medium text-slate-200">
                Who needs my presence today?
              </span>
              <input
                className="min-h-11 rounded-2xl border border-white/10 bg-slate-900/85 px-4 text-sm text-white placeholder:text-slate-500 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
                onChange={(event) => setPresenceIntention(event.target.value)}
                placeholder="Daughter, coworker, customer, friend, myself"
                value={presenceIntention}
              />
              <span className="flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                {relationshipExamples.map((example) => (
                  <span
                    className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1"
                    key={example}
                  >
                    {example}
                  </span>
                ))}
              </span>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span className="font-medium text-slate-200">Way of being</span>
              <input
                className="min-h-11 rounded-2xl border border-white/10 bg-slate-900/85 px-4 text-sm text-white placeholder:text-slate-500 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
                onChange={(event) => setWayOfBeing(event.target.value)}
                placeholder="Type your own word"
                value={wayOfBeing}
              />
            </label>
          </div>
          <div
            aria-label="Choose a way of being"
            className="mt-4 flex flex-wrap gap-2.5"
          >
            {wayOfBeingOptions.map((option) => {
              const isSelected = wayOfBeing === option;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? "border-emerald-200/70 bg-emerald-300/20 text-emerald-50 shadow-[0_0_0_1px_rgba(110,231,183,0.14)]"
                      : "border-white/10 bg-white/[0.07] text-slate-300 hover:border-white/20 hover:bg-white/10"
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

          <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Commitment Details
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Add only the context needed to protect this result.
                </p>
              </div>
              <button
                aria-controls="commitment-details-panel"
                aria-expanded={showCommitmentDetails}
                aria-label={
                  needsRecipientDetail
                    ? "Commitment details need attention"
                    : showCommitmentDetails
                      ? "Hide commitment details"
                      : "Add commitment details"
                }
                className="min-h-10 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/25"
                disabled={needsRecipientDetail}
                onClick={() => setIsCommitmentDetailsOpen((isOpen) => !isOpen)}
                type="button"
              >
                {needsRecipientDetail
                  ? "Needs detail"
                  : showCommitmentDetails
                    ? "Hide details"
                    : "Add details"}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-200">Area</p>
              <p className="mt-1 text-xs text-slate-500">
                Where does this work belong?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {primaryAreas.map((type) => (
                  <span
                    className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs text-slate-300"
                    key={type}
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>

            {showCommitmentDetails && (
              <div
                className="mt-4 grid gap-4 border-t border-white/10 pt-4"
                id="commitment-details-panel"
              >
                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">
                    Why does this matter?
                  </span>
                  <span className="text-xs text-slate-500">
                    This helps RyanOS protect the right kind of work.
                  </span>
                  <select
                    aria-label="Why does this matter?"
                    className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm text-white focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
                    onChange={(event) => setDecisionRule(event.target.value)}
                    value={decisionRule}
                  >
                    {decisionRules.map((rule) => (
                      <option key={rule} value={rule}>
                        {getDecisionRuleDisplayLabel(rule)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-200">
                    Who benefits?
                  </span>
                  <span className="text-xs text-slate-500">
                    Optional. Add a person when this result is being delivered
                    to someone.
                  </span>
                  <input
                    aria-label="Who benefits?"
                    className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
                    onChange={(event) => setBuildRecipient(event.target.value)}
                    placeholder="Maria, my daughters, a customer, patients"
                    value={buildRecipient}
                  />
                </label>

                {advancedStatuses.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      Advanced status
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Importance or parking state. These labels do not change
                      scheduling behavior.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {advancedStatuses.map((type) => (
                        <span
                          className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400"
                          key={type}
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="self-start rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Focus Check
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {hasActiveFocusCheck ? "Needs a decision" : "Clear runway"}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {hasActiveFocusCheck
                  ? "One guardrail needs attention before the day gets busy."
                  : "No guardrails need your attention."}
              </p>
            </div>
            <button
              aria-controls="focus-check-panel"
              aria-expanded={showFocusCheckDetails}
              aria-label={
                hasActiveFocusCheck
                  ? "Focus checks need attention"
                  : showFocusCheckDetails
                    ? "Hide focus checks"
                    : "Review focus checks"
              }
              className="min-h-10 shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/25"
              disabled={hasActiveFocusCheck}
              onClick={() => setIsFocusCheckOpen((isOpen) => !isOpen)}
              type="button"
            >
              {hasActiveFocusCheck
                ? "Active"
                : showFocusCheckDetails
                  ? "Hide"
                  : "Review"}
            </button>
          </div>

          {showFocusCheckDetails && (
            <div className="mt-4 grid gap-3" id="focus-check-panel">
              <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-300">
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
                  className="min-h-11 rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm text-white focus:border-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
                  inputMode="numeric"
                  onChange={(event) => setRykasBacklog(event.target.value)}
                  value={rykasBacklog}
                />
              </label>
              <div className="space-y-2 text-xs text-slate-300">
                {buildNeedsRecipient && (
                  <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-2 text-amber-100">
                    This appears to be work for someone else. Add who will
                    receive it.
                  </p>
                )}
                {shouldWarnRykasBacklog && (
                  <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-2 text-amber-100">
                    Rykas backlog needs attention. Schedule a shipping or
                    listing block today.
                  </p>
                )}
                {hasEightyPercentItem && (
                  <p className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-2 text-emerald-100">
                    You have something nearly finished. Consider shipping it
                    before starting something new.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
