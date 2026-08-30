import type { AgentDecision, AgentEvent, AgentProjectConfig, AgentWorkItem } from "@prisma/client";
import {
  resolveAgentDecisionAction,
  setAgentProjectPausedAction,
  updateAgentProjectConfigAction
} from "@/app/agent-hq/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildAgentDecisionPresentation } from "@/lib/agent-decision-display";
import { operatorIssue } from "@/lib/agent-operator-summary";
import { rykasOwnerChoiceLabel } from "@/lib/rykas-owner-data-contract";
import { parseDecisionChoices } from "@/server/agent/hq-service";

type AgentProjectSectionProps = {
  projectId: string;
  config: (AgentProjectConfig & {
    projectWorkItems: AgentWorkItem[];
    projectDecisions: Array<AgentDecision & { actionRequest: { boundedPayload: string } | null }>;
    projectEvents: AgentEvent[];
  }) | null;
};

function formatDate(value: Date | null) {
  return value
    ? value.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not yet";
}

export function AgentProjectSection({ projectId, config }: AgentProjectSectionProps) {
  if (!config) return null;
  const pendingDecisions = config.projectDecisions.filter((decision) => decision.status === "PENDING");

  return (
    <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.035] p-4" id={`agent-${projectId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Agent / Autonomy</p>
          <p className="mt-1 text-sm text-muted-foreground">{config.profile.replaceAll("_", " ")} · {config.operatingMode.replaceAll("_", " ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={config.enabled ? "success" : "warning"}>{config.enabled ? "ENABLED" : "PAUSED"}</Badge>
          <Badge variant="outline">WIP {config.maxConcurrentWorkItems}</Badge>
          <form action={setAgentProjectPausedAction}>
            <input name="projectId" type="hidden" value={projectId} />
            <input name="paused" type="hidden" value={config.enabled ? "true" : "false"} />
            <Button size="sm" variant="outline" type="submit">{config.enabled ? "Pause" : "Resume"}</Button>
          </form>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Objective</p><p className="mt-1 text-sm">{config.objective}</p></div>
        <div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">KPI / success measure</p><p className="mt-1 text-sm">{config.primaryKpi || "Not yet quantified"}</p></div>
        <div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current bottleneck</p><p className="mt-1 text-sm">{config.currentBottleneck || "No bottleneck recorded"}</p></div>
        <div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">PM review cadence</p><p className="mt-1 text-sm">Last: {formatDate(config.lastAgentReviewAt)}<br />Next: {formatDate(config.nextAgentReviewAt)}</p></div>
        <div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Autonomy policy</p><p className="mt-1 text-sm">{config.autonomyPolicy}</p></div>
        <div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Escalation policy</p><p className="mt-1 text-sm">{config.escalationPolicy}</p></div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Machine work</p>
          <div className="mt-2 space-y-2">
            {config.projectWorkItems.length === 0 && <p className="text-sm text-muted-foreground">No machine work yet.</p>}
            {config.projectWorkItems.slice(0, 6).map((item) => {
              const issue = operatorIssue(item.blocker);
              return <div className="rounded-lg border bg-background/40 p-2" key={item.id}>
                <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant="outline">{item.state.replaceAll("_", " ")}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">Attempt {item.attemptCount}/{item.maxAttempts}{item.blocker ? ` · ${issue.summary}` : ""}</p>
                {issue.technicalEvidence && <details className="mt-1 text-xs text-muted-foreground"><summary>Technical evidence</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{issue.technicalEvidence}</pre></details>}
              </div>;
            })}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">NEED RYAN</p>
          <div className="mt-2 space-y-2">
            {pendingDecisions.length === 0 && <p className="text-sm text-muted-foreground">No open decisions.</p>}
            {pendingDecisions.map((decision) => (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3" key={decision.id}>
                <p className="text-sm font-medium">{decision.question}</p>
                {(() => {
                  const presentation = buildAgentDecisionPresentation(decision);
                  return (
                    <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                      <p>{presentation.contextSummary}</p>
                      {presentation.keyFacts.length > 0 && (
                        <dl className="grid gap-1 rounded-md border bg-background/40 p-2">
                          {presentation.keyFacts.map((fact) => (
                            <div className="flex justify-between gap-2" key={fact.label}>
                              <dt>{fact.label}</dt><dd className="text-right font-medium text-foreground">{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {presentation.draft && <p className="whitespace-pre-wrap rounded-md border bg-background/40 p-2 text-foreground">{presentation.draft}</p>}
                      <details className="rounded-md border p-2">
                        <summary className="cursor-pointer font-medium text-foreground">View evidence / audit details</summary>
                        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(presentation.auditPayload, null, 2)}</pre>
                      </details>
                    </div>
                  );
                })()}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parseDecisionChoices(decision.availableChoices).map((choice) => (
                    <form action={resolveAgentDecisionAction} key={choice}>
                      <input name="decisionId" type="hidden" value={decision.id} />
                      <input name="choice" type="hidden" value={choice} />
                      <Button size="sm" variant={choice === decision.recommendedChoice ? "default" : "outline"} type="submit">{rykasOwnerChoiceLabel(choice).replaceAll("_", " ")}</Button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent agent history</p>
          <div className="mt-2 space-y-2">
            {config.projectEvents.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
            {config.projectEvents.slice(0, 8).map((event) => {
              const issue = operatorIssue(event.summary);
              return <div className="border-l-2 border-cyan-500/30 pl-3" key={event.id}>
                <p className="text-sm">{issue.summary}</p>
                <p className="text-xs text-muted-foreground">{event.type.replaceAll("_", " ")} · {formatDate(event.createdAt)}</p>
                {issue.technicalEvidence && <details className="mt-1 text-xs text-muted-foreground"><summary>Technical evidence</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{issue.technicalEvidence}</pre></details>}
              </div>;
            })}
          </div>
        </div>
      </div>

      <details className="mt-5 rounded-lg border bg-background/30 p-3">
        <summary className="cursor-pointer text-sm font-medium">Edit agent charter and controls</summary>
        <form action={updateAgentProjectConfigAction} className="mt-4 grid gap-3">
          <input name="projectId" type="hidden" value={projectId} />
          <label className="grid gap-1 text-xs text-muted-foreground">Operating mode<select className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" defaultValue={config.operatingMode} name="operatingMode"><option value="SIMULATION">SIMULATION</option><option value="LIVE_INTERNAL">LIVE INTERNAL (no external side effects)</option></select></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Objective<textarea className="min-h-20 rounded-md border bg-background p-2 text-sm text-foreground" defaultValue={config.objective} name="objective" required /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Primary KPI / success measure<input className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" defaultValue={config.primaryKpi ?? ""} name="primaryKpi" placeholder="Leave blank rather than inventing a value" /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Current bottleneck<textarea className="min-h-16 rounded-md border bg-background p-2 text-sm text-foreground" defaultValue={config.currentBottleneck ?? ""} name="currentBottleneck" /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">PM charter<textarea className="min-h-24 rounded-md border bg-background p-2 text-sm text-foreground" defaultValue={config.projectManagerInstructions} name="projectManagerInstructions" required /></label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">Autonomy policy<textarea className="min-h-24 rounded-md border bg-background p-2 text-sm text-foreground" defaultValue={config.autonomyPolicy} name="autonomyPolicy" required /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Escalation policy<textarea className="min-h-24 rounded-md border bg-background p-2 text-sm text-foreground" defaultValue={config.escalationPolicy} name="escalationPolicy" required /></label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-xs text-muted-foreground">Maximum concurrent work<input className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" defaultValue={config.maxConcurrentWorkItems} max={10} min={1} name="maxConcurrentWorkItems" type="number" /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Workspace / repository identifier<input className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" defaultValue={config.workspaceIdentifier ?? ""} name="workspaceIdentifier" /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Spending threshold (USD)<input className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" defaultValue={config.spendingThresholdCents === null ? "" : config.spendingThresholdCents / 100} min={0} name="spendingThresholdDollars" step="0.01" type="number" /></label>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">External-action approval configuration<textarea className="min-h-20 rounded-md border bg-background p-2 text-sm text-foreground" defaultValue={config.externalActionApproval ?? ""} name="externalActionApproval" /></label>
          <Button className="w-fit" type="submit">Save agent controls</Button>
        </form>
      </details>
    </section>
  );
}
