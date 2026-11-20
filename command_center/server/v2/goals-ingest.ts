import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

// Source-owned goal definitions and reported results. RyanOS stores what the
// source reports; it never edits the source's target or rules.

const isoDate = z.string().datetime({ offset: true });

export const sourceGoalSchema = z
  .object({
    sourceKey: z.string().min(1).max(200),
    title: z.string().min(1).max(120),
    desiredOutcome: z.string().max(300).nullable().optional(),
    measureKind: z.enum(["OUTCOME", "ACTION", "CONSTRAINT"]),
    metricName: z.string().max(120).nullable().optional(),
    metricDefinition: z.string().max(300).nullable().optional(),
    unit: z.string().max(30).nullable().optional(),
    target: z.number().finite().nullable().optional(),
    period: z.enum(["WEEK", "MONTH", "QUARTER", "NONE"]),
    url: z.string().url().max(2000).refine((value) => value.startsWith("https://")).nullable().optional(),
    active: z.boolean().optional()
  })
  .strict();

export const sourceResultSchema = z
  .object({
    goalSourceKey: z.string().min(1).max(200),
    periodStart: isoDate,
    periodEnd: isoDate,
    value: z.number().finite().nullable(),
    observedAt: isoDate,
    sourceRef: z.string().max(200).nullable().optional()
  })
  .strict();

export async function ingestGoals(userId: string, system: string, rawGoals: unknown[], rawResults: unknown[], db: PrismaClient) {
  let goals = 0;
  let results = 0;
  let rejected = 0;
  for (const raw of rawGoals.slice(0, 50)) {
    const parsed = sourceGoalSchema.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const goal = parsed.data;
    const data = {
      title: goal.title,
      desiredOutcome: goal.desiredOutcome ?? null,
      measureKind: goal.measureKind,
      metricName: goal.metricName ?? null,
      metricDefinition: goal.metricDefinition ?? null,
      unit: goal.unit ?? null,
      target: goal.target ?? null,
      period: goal.period,
      sourceUrl: goal.url ?? null,
      active: goal.active ?? true
    };
    await db.goal.upsert({
      where: { userId_sourceSystem_sourceKey: { userId, sourceSystem: system, sourceKey: goal.sourceKey } },
      update: data,
      create: { userId, owner: "SOURCE", sourceSystem: system, sourceKey: goal.sourceKey, ...data }
    });
    goals++;
  }
  for (const raw of rawResults.slice(0, 200)) {
    const parsed = sourceResultSchema.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const result = parsed.data;
    const goal = await db.goal.findUnique({ where: { userId_sourceSystem_sourceKey: { userId, sourceSystem: system, sourceKey: result.goalSourceKey } }, select: { id: true } });
    if (!goal) {
      rejected++;
      continue;
    }
    const periodStart = new Date(result.periodStart);
    await db.goalResult.upsert({
      where: { goalId_periodStart_evidence: { goalId: goal.id, periodStart, evidence: "SOURCE_VERIFIED" } },
      update: { value: result.value, observedAt: new Date(result.observedAt), periodEnd: new Date(result.periodEnd), sourceRef: result.sourceRef ?? null },
      create: { userId, goalId: goal.id, periodStart, periodEnd: new Date(result.periodEnd), value: result.value, evidence: "SOURCE_VERIFIED", observedAt: new Date(result.observedAt), sourceRef: result.sourceRef ?? null }
    });
    results++;
  }
  return { goals, results, rejected };
}
