import { resolveAgentDecisionAction, saveRykasFinancialTruthAction } from "@/app/agent-hq/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAgentDecisionPresentation } from "@/lib/agent-decision-display";
import { rykasOwnerChoiceLabel } from "@/lib/rykas-owner-data-contract";

type AgentDecisionCardProps = {
  decision: {
    id: string;
    category: string;
    question: string;
    context: string;
    recommendedChoice: string | null;
    choices: string[];
    expectedUpside: string | null;
    risk: string;
    amountCents: number | null;
    currency: string | null;
    createdAt: Date;
    originatingRunId: string | null;
    project: { name: string };
    originatingWorkItem: { title: string } | null;
    actionRequest: { boundedPayload: string } | null;
  };
  formatDate: (value: Date | null) => string;
};

function decisionChoiceLabel(kind: string, choice: string) {
  return kind === "RYKAS_TRUTH_RECONCILIATION"
    ? rykasOwnerChoiceLabel(choice)
    : choice.replaceAll("_", " ");
}

export function AgentDecisionCard({
  decision,
  formatDate
}: AgentDecisionCardProps) {
  const presentation = buildAgentDecisionPresentation(decision);
  const displayQuestion =
    presentation.kind === "RYKAS_TRUTH_RECONCILIATION"
      ? "Buying blocked — PO/capital truth needs update"
      : decision.question;
  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.04]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="warning">
              {decision.project.name.toUpperCase()}
            </Badge>
            <Badge variant="outline">{presentation.categoryLabel}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(decision.createdAt)}
          </span>
        </div>
        <CardTitle className="pt-2 text-xl">{displayQuestion}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {presentation.contextSummary}
        </p>
        {presentation.recommendation && (
          <p className="pt-1 text-sm font-medium">
            Recommendation: {presentation.recommendation.replaceAll("_", " ")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">
            Why this needs Ryan
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {presentation.why.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>

        {presentation.keyFacts.length > 0 && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Key facts
            </p>
            <dl className="mt-2 grid gap-2 rounded-lg border bg-background/50 p-3 text-sm sm:grid-cols-2">
              {presentation.keyFacts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd className="mt-0.5 font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {presentation.proposedAction && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Proposed action
            </p>
            <p className="mt-1 text-sm">{presentation.proposedAction}</p>
          </section>
        )}

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">
            Risk / unknown
          </p>
          <p className="mt-1 text-sm">{decision.risk}</p>
        </section>

        {presentation.draft && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Draft
            </p>
            <div className="mt-2 whitespace-pre-wrap rounded-lg border bg-background/60 p-3 text-sm leading-6">
              {presentation.draft}
            </div>
          </section>
        )}

        {presentation.kind === "RYKAS_TRUTH_RECONCILIATION" && (
          <form action={saveRykasFinancialTruthAction} className="space-y-4 rounded-lg border bg-background/60 p-4">
            <input name="decisionId" type="hidden" value={decision.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Current business cash
                <input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="businessCash" placeholder="$" step="0.01" type="number" />
              </label>
              <label className="text-sm">PO truth
                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="poCertification" defaultValue="">
                  <option value="">Leave unchanged</option><option value="CURRENT_NO_OPEN_POS">No open POs</option><option value="CURRENT_OPEN_POS_LOADED">Current open POs are loaded</option>
                </select>
              </label>
              <label className="text-sm">Obligations
                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="obligationStatus" defaultValue="">
                  <option value="">Leave unchanged</option><option value="CURRENT_NONE">None unrecorded</option><option value="CURRENT_ROWS_LOADED">Add one below</option><option value="NOT_AVAILABLE">Not available</option><option value="NEEDS_RECONCILIATION">Needs reconciliation</option>
                </select>
              </label>
              <label className="text-sm">Obligation amount<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0.01" name="obligationAmount" step="0.01" type="number" /></label>
              <label className="text-sm">Vendor<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" maxLength={200} name="obligationVendor" /></label>
              <label className="text-sm">Description<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" maxLength={1000} name="obligationDescription" /></label>
              <label className="text-sm">Due date<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="obligationDueDate" type="date" /></label>
              <label className="text-sm">Debt truth
                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="debtStatus" defaultValue="">
                  <option value="">Leave unchanged</option><option value="CURRENT_NONE">No active debt</option><option value="CURRENT_ROWS_LOADED">Add one below</option><option value="NOT_AVAILABLE">Not available</option><option value="NEEDS_RECONCILIATION">Needs reconciliation</option>
                </select>
              </label>
              <label className="text-sm">Debt label<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" maxLength={160} name="debtLabel" /></label>
              <label className="text-sm">Debt balance<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="debtBalance" step="0.01" type="number" /></label>
              <label className="text-sm">APR (%)<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" max="100" min="0" name="debtAprPercent" step="0.01" type="number" /></label>
              <label className="text-sm">Minimum payment<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="debtMinimumPayment" step="0.01" type="number" /></label>
              <label className="text-sm">Next due date<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="debtNextDueDate" type="date" /></label>
              <label className="text-sm">Owner payoff priority<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" max="100" min="1" name="debtOwnerPriority" step="1" type="number" /></label>
              <label className="text-sm">Minimum operating reserve<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="minimumOperatingReserve" step="0.01" type="number" /></label>
              <label className="text-sm">Minimum debt-payment buffer<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="minimumDebtPaymentBuffer" step="0.01" type="number" /></label>
              <label className="text-sm">Max discretionary inventory (%)<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" max="100" min="0" name="maximumDiscretionaryInventoryPercent" step="0.1" type="number" /></label>
              <label className="text-sm">Excess cash to debt (%)<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" max="100" min="0" name="percentOfExcessCashToDebt" step="0.1" type="number" /></label>
              <label className="text-sm">Max brand concentration (%)<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" max="100" min="0" name="maximumBrandConcentrationPercent" step="0.1" type="number" /></label>
              <label className="text-sm">Desired extra monthly debt payment<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="desiredMonthlyExtraDebtPayment" step="0.01" type="number" /></label>
              <label className="text-sm">Speculative test cap<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" min="0" name="speculativeTestBudgetCap" step="0.01" type="number" /></label>
              <label className="text-sm">Debt strategy<select className="mt-1 w-full rounded-md border bg-background px-3 py-2" name="debtStrategy" defaultValue="HIGHEST_APR"><option value="HIGHEST_APR">Highest APR</option><option value="OWNER_DEFINED_ORDER">Owner-defined order</option></select></label>
            </div>
            <Button type="submit">SAVE &amp; RECHECK</Button>
            <p className="text-xs text-muted-foreground">Saves only owner-confirmed planning facts in Rykas. It cannot place an order, move money, pay debt, or create a commitment.</p>
          </form>
        )}

        <div className="flex flex-wrap gap-2">
          {decision.choices.filter((choice) => presentation.kind !== "RYKAS_TRUTH_RECONCILIATION" || choice !== "UPDATED_AND_RECHECK").map((choice) => (
            <form action={resolveAgentDecisionAction} key={choice}>
              <input name="decisionId" type="hidden" value={decision.id} />
              <input name="choice" type="hidden" value={choice} />
              <Button
                variant={
                  choice === decision.recommendedChoice ? "default" : "outline"
                }
                type="submit"
              >
                {decisionChoiceLabel(presentation.kind, choice)}
              </Button>
            </form>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Approval records authorization only; it does not prove execution, send
          communication, or place a purchase.
        </p>

        <details className="rounded-lg border bg-background/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            View evidence / audit details
          </summary>
          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <p>
              Work item: {decision.originatingWorkItem?.title ?? "Not linked"}
            </p>
            <p>AgentRun ID: {decision.originatingRunId ?? "Not linked"}</p>
            {presentation.sourceUrls.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {presentation.sourceUrls.map((url) => (
                  <li key={url}>
                    <a
                      className="break-all underline"
                      href={url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2">
              {JSON.stringify(presentation.auditPayload, null, 2)}
            </pre>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
