import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { obligationFingerprint, reconcileSourceEvent, type SourceEvent } from "@/lib/v2/source-events";
import { ingestSourceEvents, recordSourceSync } from "@/server/v2/ingest";
import { completeAction } from "@/server/v2/outcomes";
import { createV2TestDb } from "./helpers/v2-db";

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("actions"));
}, 60_000);
afterAll(async () => cleanup());

const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 17, minute)).toISOString();

function event(overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    version: 1,
    system: "RYKAS",
    sourceId: "reorder-B000000001",
    kind: "ACTION",
    state: "OPEN",
    title: "Approve reorder: Item A",
    doneWhen: "PO approved or declined in Supplier OS",
    dueAt: null,
    expiresAt: null,
    durationMinutes: 15,
    workContext: "DESK",
    url: "https://supplier.example/sourcing/opportunities/B000000001",
    projectKey: "reorders",
    projectName: "Reorders",
    observedAt: at(0),
    ...overrides
  };
}

async function tasksFor(key: string) {
  return db.executionTask.findMany({ where: { userId, integrationSourceKey: key } });
}

describe("reconcile rules (pure)", () => {
  it("a new poll timestamp alone never reopens handled work", () => {
    const base = event();
    const handled = { id: "t", status: "DONE" as const, sourceFingerprint: obligationFingerprint(base), sourceState: "OPEN", sourceObservedAt: new Date(at(0)) };
    expect(reconcileSourceEvent({ ...base, observedAt: at(30) }, handled).type).toBe("IGNORE_HANDLED");
    expect(reconcileSourceEvent({ ...base, observedAt: at(30), reopen: true }, handled).type).toBe("REOPEN");
    expect(reconcileSourceEvent({ ...base, observedAt: at(30), title: "Approve reorder: Item A (new PO)" }, handled).type).toBe("REOPEN");
    expect(reconcileSourceEvent({ ...base, observedAt: at(-5) }, { ...handled, status: "NOT_STARTED" }).type).toBe("IGNORE_STALE");
  });
});

describe("one persistent action", () => {
  it("1/2: arrives once, survives refreshes, retries and concurrent sync runs", async () => {
    const first = await ingestSourceEvents(userId, [event()], db);
    expect(first[0].decision).toBe("CREATE");
    // retry of the same event, a later refresh, and two overlapping sync runs
    await ingestSourceEvents(userId, [event()], db);
    await ingestSourceEvents(userId, [event({ observedAt: at(10) })], db);
    await Promise.all([
      ingestSourceEvents(userId, [event({ observedAt: at(20) })], db),
      ingestSourceEvents(userId, [event({ observedAt: at(20) })], db)
    ]);
    const rows = await tasksFor("RYKAS:reorder-B000000001");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceSystem: "RYKAS", sourceState: "OPEN", doneWhen: "PO approved or declined in Supplier OS" });
    const project = await db.executionProject.findFirst({ where: { userId, sourceKey: "reorders" } });
    expect(rows[0].projectId).toBe(project?.id);
    expect(await db.executionProject.count({ where: { userId, sourceKey: "reorders" } })).toBe(1);
  });

  it("concurrent first arrivals of a brand-new key still create exactly one task", async () => {
    const fresh = event({ sourceId: "race-1", observedAt: at(1) });
    await Promise.all([1, 2, 3].map(() => ingestSourceEvents(userId, [fresh], db)));
    expect(await tasksFor("RYKAS:race-1")).toHaveLength(1);
  });

  it("a locally handled item is not recreated by later refreshes, but a new obligation reopens it", async () => {
    const [{ taskId }] = await ingestSourceEvents(userId, [event({ sourceId: "flagged-1", observedAt: at(2) })], db);
    await completeAction(userId, taskId as string, db);
    const refresh = await ingestSourceEvents(userId, [event({ sourceId: "flagged-1", observedAt: at(40) })], db);
    expect(refresh[0].decision).toBe("IGNORE_HANDLED");
    expect((await tasksFor("RYKAS:flagged-1"))[0].status).toBe("DONE");
    const changed = await ingestSourceEvents(userId, [event({ sourceId: "flagged-1", observedAt: at(50), revision: "v2" })], db);
    expect(changed[0].decision).toBe("REOPEN");
    const rows = await tasksFor("RYKAS:flagged-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("NOT_STARTED");
  });

  it("3/4: finishing eBay photos activates the upload step; nothing touches verified results", async () => {
    await ingestSourceEvents(userId, [
      event({ system: "EBAY", sourceId: "lot-7:photos", title: "Photograph lot 7", successorSourceId: "lot-7:upload", projectKey: "lot-7", observedAt: at(3) }),
      event({ system: "EBAY", sourceId: "lot-7:upload", title: "Upload lot 7 listing", projectKey: "lot-7", observedAt: at(3) })
    ], db);
    const [photos] = await tasksFor("EBAY:lot-7:photos");
    const [upload] = await tasksFor("EBAY:lot-7:upload");
    expect(upload.isBlocked).toBe(true);
    const goalResultsBefore = await db.goalResult.count();

    const result = await completeAction(userId, photos.id, db);
    expect(result.activatedSuccessorId).toBe(upload.id);
    const activated = await db.executionTask.findUniqueOrThrow({ where: { id: upload.id } });
    expect(activated).toMatchObject({ isBlocked: false, whenBucket: "TODAY" });
    expect(await db.goalResult.count()).toBe(goalResultsBefore);

    // 4: owner confirms upload locally; source verification is separate and later
    await completeAction(userId, upload.id, db);
    const confirmed = await db.executionTask.findUniqueOrThrow({ where: { id: upload.id } });
    expect(confirmed.localConfirmedAt).not.toBeNull();
    expect(confirmed.sourceVerifiedAt).toBeNull();
    await ingestSourceEvents(userId, [event({ system: "EBAY", sourceId: "lot-7:upload", title: "Upload lot 7 listing", projectKey: "lot-7", state: "RESOLVED", observedAt: at(45) })], db);
    const verified = await db.executionTask.findUniqueOrThrow({ where: { id: upload.id } });
    expect(verified.sourceVerifiedAt).not.toBeNull();
    expect(verified.localConfirmedAt?.getTime()).toBe(confirmed.localConfirmedAt?.getTime());
  });

  it("5: AP inspection leaves the source incident open until recovery is reported", async () => {
    const [{ taskId }] = await ingestSourceEvents(userId, [event({ system: "AP_TRADER", sourceId: "incident-maker-ready", kind: "INCIDENT", title: "Maker not ready 10+ min", projectKey: null, observedAt: at(4) })], db);
    const inspected = await completeAction(userId, taskId as string, db);
    expect(inspected.status).toBe("WAITING");
    let row = await db.executionTask.findUniqueOrThrow({ where: { id: taskId as string } });
    expect(row).toMatchObject({ status: "WAITING", sourceState: "OPEN" });
    await ingestSourceEvents(userId, [event({ system: "AP_TRADER", sourceId: "incident-maker-ready", kind: "INCIDENT", title: "Maker not ready 10+ min", projectKey: null, state: "RESOLVED", observedAt: at(55) })], db);
    row = await db.executionTask.findUniqueOrThrow({ where: { id: taskId as string } });
    expect(row).toMatchObject({ status: "DONE", sourceState: "RESOLVED" });
  });

  it("6: source failure or disappearance keeps the commitment open", async () => {
    const [{ taskId }] = await ingestSourceEvents(userId, [event({ sourceId: "gone-1", observedAt: at(5) })], db);
    await ingestSourceEvents(userId, [event({ sourceId: "gone-1", state: "GONE", observedAt: at(25) })], db);
    await recordSourceSync(userId, "RYKAS", false, "timeout", db);
    const row = await db.executionTask.findUniqueOrThrow({ where: { id: taskId as string } });
    expect(row).toMatchObject({ status: "NOT_STARTED", sourceState: "GONE" });
    const sync = await db.sourceSync.findUniqueOrThrow({ where: { userId_sourceSystem: { userId, sourceSystem: "RYKAS" } } });
    expect(sync.status).toBe("FAILING");
  });

  it("8: completing the last step with no successor flags the project's missing next step", async () => {
    const [{ taskId }] = await ingestSourceEvents(userId, [event({ sourceId: "solo-1", projectKey: "solo-project", observedAt: at(6) })], db);
    const result = await completeAction(userId, taskId as string, db);
    expect(result.projectNeedsNextStep).toBe(true);
  });

  it("20: CCHCS events that look like patient information are rejected before storage", async () => {
    const results = await ingestSourceEvents(userId, [
      event({ system: "CCHCS", sourceId: "phi-1", title: "Follow up patient John Smith DOB 01/02/1960 MRN 1234567", projectKey: null, observedAt: at(7) })
    ], db);
    expect(results[0].decision).toBe("REJECTED");
    expect(results[0].error).not.toContain("John");
    expect(await tasksFor("CCHCS:phi-1")).toHaveLength(0);
  });

  it("rejects malformed events and non-https links", async () => {
    const results = await ingestSourceEvents(userId, [{ version: 1, system: "RYKAS" }, event({ sourceId: "bad-url", url: "http://insecure.example/x" })], db);
    expect(results.map((r) => r.decision)).toEqual(["REJECTED", "REJECTED"]);
  });
});

describe("eBay area", () => {
  it("eBay items go to Rykas until an eBay area exists, then to eBay", async () => {
    await ingestSourceEvents(userId, [event({ system: "EBAY", sourceId: "area-1", title: "Mark down item 1", projectKey: "ebay:markdowns-offers", projectName: "eBay: Markdowns & offers" })], db);
    const [first] = await db.executionTask.findMany({ where: { userId, integrationSourceKey: "EBAY:area-1" }, select: { domain: { select: { slug: true } } } });
    expect(first.domain.slug).toBe("rykas");
    await db.executionDomain.create({ data: { userId, name: "eBay", slug: "ebay" } });
    await ingestSourceEvents(userId, [event({ system: "EBAY", sourceId: "area-2", title: "Mark down item 2", projectKey: "ebay:markdowns-offers", projectName: "eBay: Markdowns & offers" })], db);
    const [second] = await db.executionTask.findMany({ where: { userId, integrationSourceKey: "EBAY:area-2" }, select: { domain: { select: { slug: true } } } });
    expect(second.domain.slug).toBe("ebay");
  });
});
