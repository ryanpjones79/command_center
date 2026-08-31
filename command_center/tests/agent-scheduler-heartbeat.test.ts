import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgentOrchestrationCycle } from "@/server/agent/orchestration-service";
import {
  agentSchedulerHeartbeatId,
  deriveAgentSchedulerDisplay,
  recordAgentSchedulerFailure,
  recordAgentSchedulerStart,
  recordAgentSchedulerSuccess
} from "@/server/agent/scheduler-heartbeat";
import { ensureInitialAgentProjects } from "@/server/agent/setup-service";

const databasePath = path.join(
  process.cwd(),
  `.agent-scheduler-heartbeat-${process.pid}.db`
);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
let db: PrismaClient;
let userId: string;

beforeAll(async () => {
  closeSync(openSync(databasePath, "w"));
  const prismaCli = path.join(
    process.cwd(),
    "node_modules",
    "prisma",
    "build",
    "index.js"
  );
  execFileSync(
    process.execPath,
    [
      prismaCli,
      "db",
      "push",
      "--skip-generate",
      "--schema",
      path.join(process.cwd(), "prisma", "schema.prisma")
    ],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
  );
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const user = await db.user.create({
    data: { email: "scheduler-heartbeat@example.com", passwordHash: "test" }
  });
  userId = user.id;
  await db.executionDomain.createMany({
    data: [
      { userId, name: "Work", slug: "work", isDefault: true },
      { userId, name: "Rykas", slug: "rykas", isDefault: true }
    ]
  });
  await ensureInitialAgentProjects(userId, db);
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
});

describe("durable agent scheduler heartbeat", () => {
  it("records successful cycles even when project review state is separate", async () => {
    const startedAt = new Date("2026-08-31T03:15:00.000Z");
    const completedAt = new Date("2026-08-31T03:15:05.000Z");
    await recordAgentSchedulerStart(startedAt, db);
    await recordAgentSchedulerSuccess(
      {
        startedAt,
        completedAt,
        dueProjectCount: 2,
        claimedProjectCount: 2,
        projects: []
      },
      db
    );

    const heartbeat = await db.agentSchedulerHeartbeat.findUniqueOrThrow({
      where: { id: agentSchedulerHeartbeatId }
    });
    expect(heartbeat).toMatchObject({
      lastStartedAt: startedAt,
      lastSucceededAt: completedAt,
      cadenceMinutes: 15,
      lastDueProjectCount: 2,
      lastClaimedProjectCount: 2
    });
    expect(
      deriveAgentSchedulerDisplay(
        heartbeat,
        new Date("2026-08-31T03:45:05.000Z")
      ).status
    ).toBe("HEALTHY");
    expect(
      deriveAgentSchedulerDisplay(
        heartbeat,
        new Date("2026-08-31T03:45:05.001Z")
      ).status
    ).toBe("OVERDUE");
    expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
  });

  it("preserves the last success while surfacing a later scheduler failure", async () => {
    const startedAt = new Date("2026-08-31T03:30:00.000Z");
    const failedAt = new Date("2026-08-31T03:30:03.000Z");
    await recordAgentSchedulerFailure(
      startedAt,
      failedAt,
      new Error("Test orchestration exception"),
      db
    );
    const heartbeat = await db.agentSchedulerHeartbeat.findUniqueOrThrow({
      where: { id: agentSchedulerHeartbeatId }
    });
    expect(heartbeat.lastSucceededAt?.toISOString()).toBe(
      "2026-08-31T03:15:05.000Z"
    );
    expect(heartbeat.lastFailedAt).toEqual(failedAt);
    expect(heartbeat.lastFailure).toBe("Test orchestration exception");
    expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
  });

  it("gives due Rykas and SignalCare projects review opportunities without side effects", async () => {
    const cycleAt = new Date("2026-08-31T04:00:00.000Z");
    const projects = await db.executionProject.findMany({
      where: { userId, name: { in: ["CCHCS", "Rykas", "SignalCare"] } }
    });
    const rykasAndSignalCare = projects
      .filter((project) => ["Rykas", "SignalCare"].includes(project.name))
      .map((project) => project.id);
    const cchcs = projects.find((project) => project.name === "CCHCS")!;
    await db.agentProjectConfig.update({
      where: { projectId: cchcs.id },
      data: { enabled: false, pausedAt: cycleAt }
    });
    await db.agentProjectConfig.updateMany({
      where: { projectId: { in: rykasAndSignalCare } },
      data: {
        enabled: true,
        pausedAt: null,
        nextAgentReviewAt: cycleAt,
        leaseToken: null,
        leaseExpiresAt: null
      }
    });

    const result = await runAgentOrchestrationCycle(cycleAt, {
      userId,
      projectIds: rykasAndSignalCare,
      db
    });
    expect(result.dueProjectCount).toBe(2);
    expect(result.claimedProjectCount).toBe(2);
    expect(result.projects.map((project) => project.projectName).sort()).toEqual([
      "Rykas",
      "SignalCare"
    ]);
    expect(await db.agentActionRequest.count({ where: { userId } })).toBe(0);
    expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
  });
});
