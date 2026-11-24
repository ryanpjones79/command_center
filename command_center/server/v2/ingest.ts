import { Prisma, type PrismaClient } from "@prisma/client";
import { detectPhi } from "@/lib/execution-validation";
import {
  integrationKey,
  obligationFingerprint,
  reconcileSourceEvent,
  sourceEventSchema,
  type ReconcileDecision,
  type SourceEvent
} from "@/lib/v2/source-events";

// Stores inbound source events as persistent RyanOS actions. Read-only toward
// the source: nothing here calls back into another system.

export const SYSTEM_DOMAIN_SLUG: Record<string, string> = {
  RYKAS: "rykas",
  EBAY: "ebay",
  STORE_ROUTE: "rykas",
  AP_TRADER: "betting-models",
  CASINO_AP: "casino-ap",
  CCHCS: "work",
  EMAIL: "admin",
  CAPTURE: "admin"
};

// eBay has its own area since 2026-11-22; until that area exists, eBay items go to Rykas.
const SYSTEM_FALLBACK_SLUG: Record<string, string> = { EBAY: "rykas" };

export type IngestResult = {
  key: string;
  taskId: string | null;
  decision: ReconcileDecision["type"] | "REJECTED";
  error?: string;
};

type Tx = Prisma.TransactionClient;

function durationBucket(minutes: number | null | undefined) {
  if (!minutes) return null;
  if (minutes <= 30) return "UNDER_30_MIN" as const;
  if (minutes <= 60) return "THIRTY_TO_SIXTY_MIN" as const;
  if (minutes <= 120) return "ONE_TO_TWO_HOURS" as const;
  return "TWO_HOURS_PLUS" as const;
}

async function resolveDomainId(tx: Tx, userId: string, system: string) {
  const slug = SYSTEM_DOMAIN_SLUG[system] ?? "admin";
  const fallback = SYSTEM_FALLBACK_SLUG[system];
  const domain =
    (await tx.executionDomain.findFirst({ where: { userId, slug }, select: { id: true } })) ??
    (fallback ? await tx.executionDomain.findFirst({ where: { userId, slug: fallback }, select: { id: true } }) : null) ??
    (await tx.executionDomain.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!domain) throw new Error("No task domains exist for this user.");
  return domain.id;
}

async function resolveProjectId(tx: Tx, userId: string, domainId: string, event: SourceEvent) {
  if (!event.projectKey) return null;
  const existing = await tx.executionProject.findFirst({
    where: { userId, sourceSystem: event.system, sourceKey: event.projectKey },
    select: { id: true }
  });
  if (existing) return existing.id;
  const baseName = (event.projectName ?? event.projectKey).slice(0, 100);
  const clash = await tx.executionProject.findFirst({ where: { userId, name: baseName }, select: { id: true } });
  const created = await tx.executionProject.create({
    data: {
      userId,
      domainId,
      name: clash ? `${baseName} (${event.system.toLowerCase()})` : baseName,
      sourceSystem: event.system,
      sourceKey: event.projectKey
    },
    select: { id: true }
  });
  return created.id;
}

function sourceFields(event: SourceEvent, fingerprint: string) {
  return {
    sourceSystem: event.system,
    sourceKind: event.kind,
    sourceUrl: event.url ?? null,
    sourceState: event.state,
    sourceFingerprint: fingerprint,
    sourceObservedAt: new Date(event.observedAt),
    sourceCheckedAt: new Date(),
    doneWhen: event.doneWhen ?? null,
    expiresAt: event.expiresAt ? new Date(event.expiresAt) : null,
    goalKey: event.goalKey ?? null,
    successorTaskId: event.successorSourceId ? integrationKey(event.system, event.successorSourceId) : null
  };
}

async function logEvent(tx: Tx, userId: string, taskId: string, type: string, detail: string, idempotencyKey: string) {
  await tx.executionTaskEvent.upsert({
    where: { idempotencyKey },
    update: {},
    create: { userId, taskId, type, detail: detail.slice(0, 500), idempotencyKey }
  });
}

async function applyEvent(tx: Tx, userId: string, event: SourceEvent): Promise<IngestResult> {
  const key = integrationKey(event.system, event.sourceId);
  const fingerprint = obligationFingerprint(event);
  const existing = await tx.executionTask.findUnique({
    where: { userId_integrationSourceKey: { userId, integrationSourceKey: key } },
    select: { id: true, status: true, sourceFingerprint: true, sourceState: true, sourceObservedAt: true, sourceKind: true }
  });
  const decision = reconcileSourceEvent(event, existing);
  const eventKey = `${key}:${event.state}:${fingerprint}:${event.observedAt}`;

  if (decision.type === "CREATE") {
    const domainId = await resolveDomainId(tx, userId, event.system);
    const projectId = await resolveProjectId(tx, userId, domainId, event);
    // A step that some open task names as its successor waits for that step.
    const predecessor = await tx.executionTask.findFirst({
      where: { userId, successorTaskId: key, status: { notIn: ["DONE", "DROPPED"] } },
      select: { id: true }
    });
    const created = await tx.executionTask.create({
      data: {
        userId,
        domainId,
        projectId,
        title: event.title,
        type: "ACTION",
        status: event.state === "RESOLVED" ? "DONE" : "NOT_STARTED",
        completedAt: event.state === "RESOLVED" ? new Date() : null,
        priority: event.dueAt || event.expiresAt ? "HIGH" : "MEDIUM",
        whenBucket: "THIS_WEEK",
        dueDate: event.dueAt ? new Date(event.dueAt) : null,
        estimatedDuration: durationBucket(event.durationMinutes),
        remainingMinutes: event.durationMinutes ?? null,
        workContext: event.workContext ?? null,
        isBlocked: Boolean(predecessor),
        waitingOn: predecessor ? "Previous step" : null,
        needsJudgment: Boolean(event.needsJudgment),
        integrationSourceKey: key,
        source: `${event.system} feed`,
        ...sourceFields(event, fingerprint),
        sourceVerifiedAt: event.state === "RESOLVED" ? new Date(event.observedAt) : null
      },
      select: { id: true }
    });
    await logEvent(tx, userId, created.id, "ARRIVED", `${event.system} ${event.kind}`, eventKey);
    return { key, taskId: created.id, decision: decision.type };
  }

  const taskId = (existing as NonNullable<typeof existing>).id;
  if (decision.type === "IGNORE_STALE") return { key, taskId, decision: decision.type };

  if (decision.type === "IGNORE_HANDLED") {
    await tx.executionTask.update({ where: { id: taskId }, data: { sourceCheckedAt: new Date() } });
    return { key, taskId, decision: decision.type };
  }

  if (decision.type === "SOURCE_RESOLVED") {
    const current = await tx.executionTask.findUniqueOrThrow({ where: { id: taskId }, select: { status: true } });
    const open = current.status !== "DONE" && current.status !== "DROPPED";
    await tx.executionTask.update({
      where: { id: taskId },
      data: {
        ...sourceFields(event, fingerprint),
        sourceVerifiedAt: new Date(event.observedAt),
        // Resolution by the source closes an incident the owner already inspected
        // (WAITING on recovery) or any still-open item; scheduled time is released.
        ...(open ? { status: "DONE" as const, completedAt: new Date(), waitingOn: null, scheduledStart: null, scheduledEnd: null } : {})
      }
    });
    await logEvent(tx, userId, taskId, "SOURCE_VERIFIED", `${event.system} reported resolved`, eventKey);
    return { key, taskId, decision: decision.type };
  }

  if (decision.type === "REOPEN") {
    await tx.executionTask.update({
      where: { id: taskId },
      data: {
        ...sourceFields(event, fingerprint),
        title: event.title,
        dueDate: event.dueAt ? new Date(event.dueAt) : null,
        status: "NOT_STARTED",
        completedAt: null,
        localConfirmedAt: null,
        sourceVerifiedAt: null,
        whenBucket: "THIS_WEEK",
        needsJudgment: Boolean(event.needsJudgment)
      }
    });
    await logEvent(tx, userId, taskId, "REOPENED", decision.reason, eventKey);
    return { key, taskId, decision: decision.type };
  }

  // UPDATE_SOURCE: refresh source-owned fields; keep local schedule/handling.
  await tx.executionTask.update({
    where: { id: taskId },
    data: {
      ...sourceFields(event, fingerprint),
      title: event.title,
      dueDate: event.dueAt ? new Date(event.dueAt) : undefined
    }
  });
  if (existing?.sourceFingerprint !== fingerprint || existing?.sourceState !== event.state) {
    await logEvent(tx, userId, taskId, "SOURCE_UPDATED", `${event.system} ${event.state}`, eventKey);
  }
  return { key, taskId, decision: decision.type };
}

// Validates and stores events one at a time. A concurrent insert of the same key
// (unique violation) is retried once as an update, so overlapping sync runs and
// retries never create duplicates.
// Field Book (CASINO_AP) tags each offer with its casino. Ryan doesn't want a project per casino, so offers go
// straight to the Casino/AP area and the casino name moves into the title ("Thunder Valley: Use $50 free play").
export function flattenCasinoProject<T extends { system: string; title: string; projectKey?: string | null; projectName?: string | null }>(event: T): T {
  if (event.system !== "CASINO_AP" || (!event.projectKey && !event.projectName)) return event;
  const casino = (event.projectName ?? "").replace(/^casino( ap)?:\s*/i, "").trim();
  const title = casino && !event.title.toLowerCase().includes(casino.toLowerCase()) ? `${casino}: ${event.title}`.slice(0, 300) : event.title;
  return { ...event, title, projectKey: undefined, projectName: undefined };
}

export async function ingestSourceEvents(userId: string, rawEvents: unknown[], db: PrismaClient): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const raw of rawEvents.slice(0, 200)) {
    const parsed = sourceEventSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ key: "invalid", taskId: null, decision: "REJECTED", error: "Event failed validation." });
      continue;
    }
    const event = flattenCasinoProject(parsed.data);
    const key = integrationKey(event.system, event.sourceId);
    if (event.system === "CCHCS") {
      const flagged = [event.title, event.doneWhen ?? "", event.projectName ?? ""].some((value) => detectPhi(value).length > 0);
      if (flagged) {
        results.push({ key, taskId: null, decision: "REJECTED", error: "Rejected: possible patient information (NO PHI)." });
        continue;
      }
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        results.push(await db.$transaction((tx) => applyEvent(tx, userId, event)));
        break;
      } catch (error) {
        const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (duplicate && attempt === 0) continue;
        results.push({ key, taskId: null, decision: "REJECTED", error: "Could not store event." });
        break;
      }
    }
  }
  return results;
}

// Marks a source as failing without touching saved commitments; the UI shows
// its items as "source unknown since <time>".
export async function recordSourceSync(userId: string, sourceSystem: string, ok: boolean, error: string | null, db: PrismaClient) {
  const now = new Date();
  await db.sourceSync.upsert({
    where: { userId_sourceSystem: { userId, sourceSystem } },
    update: ok
      ? { status: "OK", lastAttemptAt: now, lastSuccessAt: now, lastError: null }
      : { status: "FAILING", lastAttemptAt: now, lastError: (error ?? "unknown").slice(0, 300) },
    create: { userId, sourceSystem, status: ok ? "OK" : "FAILING", lastAttemptAt: now, lastSuccessAt: ok ? now : null, lastError: ok ? null : (error ?? "unknown").slice(0, 300) }
  });
}
