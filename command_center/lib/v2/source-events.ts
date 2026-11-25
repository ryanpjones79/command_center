import { createHash } from "node:crypto";
import { z } from "zod";

// RyanOS v2 inbound source contract (docs/RYANOS_V2_MODEL.md).
//
// Source apps own their analysis; they send RyanOS the resulting actions.
// RyanOS stores each as ONE persistent ExecutionTask keyed by
// integrationSourceKey = "<SYSTEM>:<sourceId>" and never writes back.

export const SOURCE_SYSTEMS = ["RYKAS", "EBAY", "STORE_ROUTE", "AP_TRADER", "CASINO_AP", "CCHCS", "EMAIL", "CAPTURE", "CHATGPT"] as const;

// Handoff systems prepare work FOR Ryan (ChatGPT: job research, resumes, proposals). Their items are his own
// to-dos with a draft attached, not app check-ins, and can be "Agent preparing" until ready.
export const HANDOFF_SYSTEMS = new Set<string>(["CHATGPT"]);
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

// ACTION: work for Ryan. INCIDENT: a source condition; local "Done" means
// "I inspected/handled my part" and the item stays open until the source
// reports recovery. OFFER: an opportunity that can expire.
export const SOURCE_KINDS = ["ACTION", "INCIDENT", "OFFER"] as const;

// Source-reported state of the underlying obligation, separate from local
// handling. GONE/UNKNOWN never prove completion.
export const SOURCE_STATES = ["OPEN", "RESOLVED", "GONE", "UNKNOWN"] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

const isoDate = z.string().datetime({ offset: true });
const httpsUrl = z.string().url().max(2000).refine((value) => value.startsWith("https://"), "https only");

export const sourceEventSchema = z
  .object({
    version: z.literal(1),
    system: z.enum(SOURCE_SYSTEMS),
    sourceId: z.string().min(1).max(200).regex(/^[A-Za-z0-9._:@\-/#]+$/),
    kind: z.enum(SOURCE_KINDS).default("ACTION"),
    state: z.enum(SOURCE_STATES).default("OPEN"),
    title: z.string().min(1).max(2000), // long titles are shortened on arrival; the full text is kept
    doneWhen: z.string().max(400).nullable().optional(),
    dueAt: isoDate.nullable().optional(),
    expiresAt: isoDate.nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480).nullable().optional(),
    workContext: z.enum(["DESK", "ADMIN", "ERRAND", "PHONE", "HOME", "ANYWHERE"]).nullable().optional(),
    url: httpsUrl.nullable().optional(),
    projectKey: z.string().max(200).nullable().optional(),
    projectName: z.string().max(120).nullable().optional(),
    goalKey: z.string().max(200).nullable().optional(),
    // Present when the source knows the next step after this one.
    successorSourceId: z.string().max(200).nullable().optional(),
    // Source explicitly says a previously handled obligation is new again.
    reopen: z.boolean().optional(),
    // Optional source revision of the obligation (e.g. offer version).
    revision: z.string().max(100).nullable().optional(),
    // When the clear meaning or timing is uncertain, the item needs Ryan's judgment.
    needsJudgment: z.boolean().optional(),
    // Full imported note, alert or report. Kept in the task's details; the title stays short.
    details: z.string().max(8000).nullable().optional(),
    // Handoff (agent-prepared work): PREPARING = the agent is still working on it (not bookable);
    // READY = ready for Ryan. `preparing` says what the agent is doing.
    handoff: z.enum(["PREPARING", "READY"]).optional(),
    preparing: z.string().max(120).nullable().optional(),
    draftUrl: httpsUrl.nullable().optional(),
    draftTitle: z.string().max(120).nullable().optional(),
    // Attach to an existing RyanOS task instead of creating one (reuse the record Ryan already has).
    ryanosTaskId: z.string().min(10).max(40).regex(/^[a-z0-9]+$/).nullable().optional(),
    observedAt: isoDate
  })
  .strict();

export type SourceEvent = z.infer<typeof sourceEventSchema>;

export function integrationKey(system: string, sourceId: string) {
  return `${system}:${sourceId}`;
}

// Fingerprint of the OBLIGATION, not the poll: timestamps and source state are
// excluded so a fresh observedAt alone never looks like new work.
export function obligationFingerprint(event: Pick<SourceEvent, "title" | "doneWhen" | "dueAt" | "expiresAt" | "revision" | "kind">) {
  const material = JSON.stringify([
    event.kind,
    event.title.trim().toLowerCase(),
    (event.doneWhen ?? "").trim().toLowerCase(),
    event.dueAt ? new Date(event.dueAt).toISOString() : null,
    event.expiresAt ? new Date(event.expiresAt).toISOString() : null,
    event.revision ?? null
  ]);
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export type ExistingTaskView = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "DONE" | "DROPPED";
  sourceFingerprint: string | null;
  sourceState: string | null;
  sourceObservedAt: Date | null;
};

export type ReconcileDecision =
  | { type: "CREATE" }
  | { type: "UPDATE_SOURCE" } // refresh source fields; keep local schedule and handling
  | { type: "REOPEN"; reason: "SOURCE_REOPENED" | "NEW_OBLIGATION" }
  | { type: "SOURCE_RESOLVED" } // source verifies completion
  | { type: "IGNORE_STALE" } // older than what we already have
  | { type: "IGNORE_HANDLED" }; // locally handled; same obligation still visible upstream

export function reconcileSourceEvent(event: SourceEvent, existing: ExistingTaskView | null): ReconcileDecision {
  if (!existing) return { type: "CREATE" };
  const observed = new Date(event.observedAt);
  if (existing.sourceObservedAt && observed < existing.sourceObservedAt) return { type: "IGNORE_STALE" };
  if (event.state === "RESOLVED") return { type: "SOURCE_RESOLVED" };

  const handled = existing.status === "DONE" || existing.status === "DROPPED";
  if (!handled) return { type: "UPDATE_SOURCE" };
  if (event.state !== "OPEN") return { type: "IGNORE_HANDLED" };
  if (event.reopen) return { type: "REOPEN", reason: "SOURCE_REOPENED" };
  if (existing.sourceFingerprint && existing.sourceFingerprint !== obligationFingerprint(event)) {
    return { type: "REOPEN", reason: "NEW_OBLIGATION" };
  }
  return { type: "IGNORE_HANDLED" };
}

// What a local "Done" means for a source-backed item.
export function localCompletionOutcome(kind: string | null, sourceState: string | null) {
  if (kind === "INCIDENT" && sourceState !== "RESOLVED") {
    return { status: "WAITING" as const, waitingOn: "Source recovery not reported yet" };
  }
  return { status: "DONE" as const, waitingOn: null };
}
