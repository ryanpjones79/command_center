import { z } from "zod";
import { detectPhi, executionTaskSchema } from "@/lib/execution-validation";

export class TaskConnectorError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const nullableText = (max: number) => z.string().max(max).nullable();
const date = z.string().datetime({ offset: true }).nullable();
const fields = executionTaskSchema.shape;
const reference = z
  .object({
    provider: z.enum(["gmail", "outlook", "other"]).default("other"),
    title: z.string().trim().min(2).max(180),
    url: z
      .string()
      .max(1000)
      .url()
      .refine((value) => ["https:", "http:"].includes(new URL(value).protocol)),
    note: nullableText(500).optional(),
  })
  .strict();
const changes = {
  title: z.string().trim().min(2).max(120),
  projectId: z.string().cuid().nullable(),
  type: fields.type,
  status: fields.status,
  priority: fields.priority,
  whenBucket: fields.whenBucket,
  estimatedDuration: fields.estimatedDuration.unwrap().nullable(),
  dueDate: date,
  followUpDate: date,
  waitingOn: nullableText(180),
  note: nullableText(1000),
  source: nullableText(180),
  isBlocked: z.boolean(),
};
const sourceKey = z
  .string()
  .min(6)
  .max(180)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9:._/-]+$/);

export const createTaskInput = z
  .object({
    reviewed: z.literal(true),
    domainId: fields.domainId,
    sourceKey,
    ...changes,
    projectId: changes.projectId.optional(),
    type: changes.type.default("ACTION"),
    status: z
      .enum(["NOT_STARTED", "IN_PROGRESS", "WAITING"])
      .default("NOT_STARTED"),
    priority: changes.priority.default("MEDIUM"),
    whenBucket: changes.whenBucket.default("THIS_WEEK"),
    estimatedDuration: changes.estimatedDuration.optional(),
    dueDate: changes.dueDate.optional(),
    followUpDate: changes.followUpDate.optional(),
    waitingOn: changes.waitingOn.optional(),
    note: changes.note.optional(),
    source: z.string().trim().min(2).max(180),
    isBlocked: changes.isBlocked.default(false),
    references: z.array(reference).max(5).default([]),
  })
  .strict();

export const updateTaskInput = z
  .object({
    reviewed: z.literal(true),
    sourceKey: sourceKey.optional(), // One-time adoption of a matching UI-created task.
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    patch: z.object(changes).partial().strict(),
    addReferences: z.array(reference).max(5).default([]),
  })
  .strict()
  .refine(
    (input) =>
      Object.keys(input.patch).length > 0 || input.addReferences.length > 0,
  );

export const listTaskInput = z
  .object({
    domainId: fields.domainId,
    projectId: z.string().cuid().optional(),
    q: z.string().max(120).optional(),
    sourceKey: z.string().max(180).optional(),
    status: fields.status.optional(),
    cursor: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new TaskConnectorError(
      400,
      "INVALID_INPUT",
      "Invalid task input; check field names, lengths and values.",
    );
  return parsed.data;
}

export function rejectSensitiveContext(input: unknown) {
  // The existing app guard is heuristic. This connector is for operational summaries only.
  if (detectPhi(JSON.stringify(input)).length > 0) {
    throw new TaskConnectorError(
      400,
      "SENSITIVE_CONTEXT",
      "Use a PHI-free operational summary.",
    );
  }
}

export type TaskAccess = {
  userId: string;
  domainIds: string[] | null; // null is an authenticated owner's browser session only.
  operations: Array<"read" | "create" | "update">;
};
