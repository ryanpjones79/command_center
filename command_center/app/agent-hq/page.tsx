import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, Clock3, Pause, Play, ShieldCheck } from "lucide-react";
import {
  setAgentProjectPausedAction
} from "@/app/agent-hq/actions";
import { AgentDecisionCard } from "@/components/agent/agent-decision-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { groupRecentEvents, operatorIssue } from "@/lib/agent-operator-summary";
import { getAgentHqData } from "@/server/agent/hq-service";

export const metadata: Metadata = { title: "Agent HQ" };

function formatDate(value: Date | null) {
  if (!value) return "Not yet";

  return value.toLocaleString("en-US", {
    timeZone: process.env.DAILY_BRIEF_TIMEZONE || "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function statusVariant(status: string) {
  if (["ON_TRACK", "HEALTHY", "DONE"].includes(status)) return "success" as const;
  if (["BLOCKED", "FAILED"].includes(status)) return "danger" as const;
  if (["NEEDS_ATTENTION", "NEEDS_RYAN", "RETRY", "OVERDUE"].includes(status)) return "warning" as const;
  return "outline" as const;
}

function movementKind(metadata: string | null) {
  if (!metadata) return null;
  try { const value = JSON.parse(metadata) as { movementKind?: string }; return value.movementKind ?? null; } catch { return null; }
}

function pmDecisionDetails(type: string, metadata: string | null) {
  if (type !== "PM_DECISION_RECORDED" || !metadata) return null;
  try {
    return JSON.parse(metadata) as {
      disposition?: string;
      currentBottleneck?: string;
      evidence?: string;
      nextReviewMinutes?: number;
      ownerNeeded?: boolean;
    };
  } catch {
    return null;
  }
}

export default async function AgentHqPage() {
  const user = await requireUser();
  const data = await getAgentHqData(user.id);
  const currentParkedOrFailed = data.configs.flatMap((config) =>
    config.displayState.paused
      ? []
      : config.project.agentWorkItems
          .filter((item) =>
            item.state === "PARKED" ||
            (item.state === "FAILED" && config.displayState.machineWorkState.currentRetryFailureCount > 0)
          )
          .slice(0, 3)
          .map((item) => ({ item, projectName: config.project.name }))
  );
  const recentMovement = groupRecentEvents(data.events, 12);

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-950 to-cyan-950/40 p-5 text-slate-50 shadow-xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              <Bot className="h-4 w-4" /> Chief / Portfolio
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">Agent HQ</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Owner control plane for durable agent work, independent QA, and consequential decisions.
              Phase 2A supports live internal planning and isolated repository work. External communication, spending, buying, deployment, and destructive actions remain disabled.
            </p>
          </div>
          <Badge variant={statusVariant(data.chief.status)}>{data.chief.status.replaceAll("_", " ")}</Badge>
        </div>
        <p className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          {data.chief.attentionSummary}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Scheduler</CardTitle><CardDescription>Durable Railway agent-orchestration heartbeat.</CardDescription></div><Badge variant={statusVariant(data.scheduler.status)}>{data.scheduler.status}</Badge></div></CardHeader><CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Last agent cycle: {formatDate(data.scheduler.lastCycleAt)}</p>
          <p>Next expected cycle: {formatDate(data.scheduler.nextExpectedCycleAt)}</p>
          <p className="text-xs">Cadence: every {data.scheduler.cadenceMinutes} minutes. A late cycle does not create NEED RYAN.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Local runner</CardTitle><CardDescription>Outbound polling only; no inbound Windows exposure.</CardDescription></CardHeader><CardContent className="space-y-2">
          {data.runners.length === 0 ? <p className="text-sm text-muted-foreground">No runner registered. Live-internal work remains safely queued.</p> : data.runners.map((runner) => {
            const issue = operatorIssue(runner.recentFailure);
            return <div className="rounded-lg border p-3" key={runner.id}><div className="flex justify-between gap-2"><span className="font-medium">{runner.name}</span><Badge variant={runner.effectiveStatus === "ONLINE" ? "success" : "warning"}>{runner.effectiveStatus}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Last heartbeat {formatDate(runner.lastHeartbeatAt)} · Version {runner.version ?? "unknown"}</p><p className="mt-1 text-xs text-muted-foreground">Current work {runner.currentWorkItemId ?? "none"} · Last success {formatDate(runner.lastSuccessfulRunAt)}</p>{runner.recentFailure && <><p className="mt-2 text-xs text-amber-400">{issue.summary}</p>{issue.technicalEvidence && <details className="mt-2 text-xs text-muted-foreground"><summary>Technical evidence</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{issue.technicalEvidence}</pre></details>}</>}</div>;
          })}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Authorized / awaiting execution</CardTitle><CardDescription>Approval records authority; execution evidence completes an action.</CardDescription></CardHeader><CardContent className="space-y-2">
          {data.actions.length === 0 ? <p className="text-sm text-muted-foreground">No authorized actions are waiting.</p> : data.actions.map((action) => <div className="rounded-lg border p-3" key={action.id}><div className="flex justify-between gap-2"><span className="text-sm font-medium">{action.project.name}</span><Badge variant="warning">{action.state.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{action.category.replaceAll("_", " ")} · one transaction only</p></div>)}
        </CardContent></Card>
      </section>

      <section aria-label="Portfolio metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {[
          ["Active projects", data.summary.activeProjects],
          ["Active work", data.summary.activeWork],
          ["Completed outcomes", data.summary.completedOutcomes],
          ["Retries / failures", data.summary.retriesAndFailures],
          ["Need attention", data.summary.projectsRequiringAttention],
          ["Need Ryan", data.summary.needRyan],
          ["WIP violations", data.summary.wipViolations]
        ].map(([label, value]) => (
          <Card className="bg-card/90" key={label}>
            <CardContent className="pt-5">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Owner inbox</p>
            <h3 className="mt-1 text-2xl font-semibold">NEED RYAN</h3>
          </div>
          <Badge variant={data.decisions.length ? "warning" : "success"}>{data.decisions.length} open</Badge>
        </div>
        {data.decisions.length === 0 ? (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="flex items-center gap-3 pt-5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Nothing needs an owner decision right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.decisions.map((decision) => (
              <AgentDecisionCard decision={decision} formatDate={formatDate} key={decision.id} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Project managers</p>
          <h3 className="mt-1 text-2xl font-semibold">Portfolio projects</h3>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {data.configs.map((config) => {
            const display = config.displayState;
            return (
              <Card className="flex h-full flex-col bg-card/90" key={config.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{config.project.name}</CardTitle>
                      <CardDescription className="mt-1">{config.profile.replaceAll("_", " ")}</CardDescription>
                    </div>
                    <Badge variant={statusVariant(display.displayHealth)}>{display.displayHealth.replaceAll("_", " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Objective</p>
                    <p className="mt-1 text-sm">{config.objective}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current bottleneck</p>
                    <p className="mt-1 text-sm">{display.displayBottleneck}</p>
                    {display.supportingState?.kind === "RYKAS_TRUTH" && (
                      <div className="mt-2 grid gap-1 rounded-lg border bg-background/40 p-2 text-xs text-muted-foreground">
                        <span>Financial health: {display.supportingState.financialHealth ?? "Unknown"}</span>
                        <span>Settled cash: {display.supportingState.settledCash === null ? "Unknown" : display.supportingState.settledCash.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                        <span>Protected commitments: {display.supportingState.protectedCommitments === null ? "Unknown" : display.supportingState.protectedCommitments.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                        <span>Known inventory at cost: {display.supportingState.knownInventoryAtCost === null ? "Unknown" : display.supportingState.knownInventoryAtCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                        <span>Total debt: {display.supportingState.totalDebt === null ? "Unknown" : display.supportingState.totalDebt.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                        <span>Safe buying capacity: {display.supportingState.safeBuyingCapacity === null ? "BLOCKED" : display.supportingState.safeBuyingCapacity.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                        {display.supportingState.currentBlockers.length > 0 && <div className="mt-1"><span className="font-medium text-foreground">Current blockers:</span><ul className="ml-4 list-disc">{display.supportingState.currentBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
                      </div>
                    )}
                    {display.supportingState?.kind === "SIGNALCARE_PIPELINE" && (
                      <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border bg-background/40 p-2 text-xs text-muted-foreground">
                        <span>Qualified: {display.supportingState.qualified}</span>
                        <span>Researching: {display.supportingState.researching}</span>
                        <span>Queued: {display.supportingState.queued}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current machine work</p>
                    <p className="mt-1 text-sm text-muted-foreground">{display.machineWorkState.currentSummary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Mode: {display.paused ? "PAUSED" : config.operatingMode.replaceAll("_", " ")} · WIP {display.machineWorkState.activeCount}/{config.maxConcurrentWorkItems}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Latest completed outcome</p>
                    <p className="mt-1 text-sm">{display.displayLatestOutcome}</p>
                  </div>
                  <div className="mt-auto grid gap-2 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Next review {display.nextReviewState === "PAUSED" ? "Paused" : formatDate(display.nextReviewAt)}</span>
                    <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> NEED RYAN {display.pendingOwnerDecisionCount}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild className="flex-1" variant="outline"><Link href={`/projects#agent-${config.projectId}`}>Project details</Link></Button>
                    <form action={setAgentProjectPausedAction}>
                      <input name="projectId" type="hidden" value={config.projectId} />
                      <input name="paused" type="hidden" value={display.paused ? "false" : "true"} />
                      <Button aria-label={display.paused ? "Resume agent" : "Pause agent"} variant={display.paused ? "default" : "outline"} type="submit">
                        {display.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader><CardTitle>Recent movement</CardTitle><CardDescription>Operational state changes and outcomes—not token telemetry or private reasoning.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {recentMovement.length === 0 && <p className="text-sm text-muted-foreground">No agent movement recorded yet.</p>}
            {recentMovement.map((event) => {
              const pmDecision = pmDecisionDetails(event.type, event.metadata);
              return (
                <div className="flex gap-3 rounded-lg border p-3" key={event.id}>
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                  <div className="min-w-0">
                    <p className="text-sm"><span className="font-medium">{event.project.name}:</span> {event.operatorSummary}{event.repeatCount > 1 ? ` (${event.repeatCount} similar events)` : ""}</p>
                    {event.technicalEvidence && <details className="mt-2 text-xs text-muted-foreground"><summary>Technical evidence</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{event.technicalEvidence}</pre></details>}
                    {movementKind(event.metadata) && <Badge className="mt-1" variant="success">Movement: {movementKind(event.metadata)!.replaceAll("_", " ")}</Badge>}
                    {pmDecision && (
                      <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">Bottleneck:</span> {pmDecision.currentBottleneck || "Not specified"}</p>
                        <p className="mt-1"><span className="font-medium text-foreground">Evidence:</span> {pmDecision.evidence || "Not supplied"}</p>
                        <p className="mt-1">Next review: {pmDecision.nextReviewMinutes ?? 15} minutes · Owner needed: {pmDecision.ownerNeeded ? "yes" : "no"}</p>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{event.type.replaceAll("_", " ")} · {formatDate(event.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Parked / stalled</CardTitle><CardDescription>Stagnation stays visible to the Chief.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {currentParkedOrFailed.map(({ item, projectName }) => {
              const issue = operatorIssue(item.blocker);
              return <div className="rounded-lg border p-3" key={item.id}>
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant={statusVariant(item.state)}>{item.state}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{projectName} · {issue.summary}</p>
                {issue.technicalEvidence && <details className="mt-2 text-xs text-muted-foreground"><summary>Technical evidence</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{issue.technicalEvidence}</pre></details>}
              </div>;
            })}
            {data.chief.stalledProjectIds.length === 0 && currentParkedOrFailed.length === 0 && (
              <p className="text-sm text-muted-foreground">No parked work or stalled projects.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
