import { resolveAgentDecisionAction } from "@/app/agent-hq/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAgentDecisionPresentation } from "@/lib/agent-decision-display";
import { rykasOwnerChoiceLabel } from "@/lib/rykas-owner-data-contract";
import { RykasFinancialTruthForm } from "@/components/agent/rykas-financial-truth-form";

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

        {presentation.kind === "RYKAS_TRUTH_RECONCILIATION" && <RykasFinancialTruthForm decisionId={decision.id} />}

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
