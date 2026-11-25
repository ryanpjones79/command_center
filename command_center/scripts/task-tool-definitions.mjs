const text = (maxLength) => ({
  type: "string",
  ...(maxLength ? { maxLength } : {}),
});
const enumeration = (values) => ({ type: "string", enum: values });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const status = enumeration([
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING",
  "DONE",
  "DROPPED",
]);
const reference = object(
  {
    provider: enumeration(["gmail", "outlook", "other"]),
    title: text(180),
    url: text(1000),
    note: nullable(text(500)),
  },
  ["title", "url"],
);
const refs = { type: "array", items: reference, maxItems: 5 };
const patch = {
  title: text(120),
  projectId: nullable(text()),
  type: enumeration(["ACTION", "FOLLOW_UP", "ADMIN", "QUICK_WIN"]),
  status,
  priority: enumeration(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  whenBucket: enumeration([
    "TODAY",
    "THIS_WEEK",
    "LATER",
    "WAITING",
    "PARKING_LOT",
  ]),
  estimatedDuration: nullable(
    enumeration([
      "UNDER_30_MIN",
      "THIRTY_TO_SIXTY_MIN",
      "ONE_TO_TWO_HOURS",
      "TWO_HOURS_PLUS",
    ]),
  ),
  dueDate: nullable({ type: "string", format: "date-time" }),
  followUpDate: nullable({ type: "string", format: "date-time" }),
  waitingOn: nullable(text(180)),
  note: nullable(text(1000)),
  source: nullable(text(180)),
  isBlocked: { type: "boolean" },
};
export const tools = [
  {
    name: "ryanos_task_catalog",
    description:
      "List permitted owned areas and projects; resolve IDs before task work.",
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "ryanos_task_list",
    description:
      "Search one permitted area, including completed/dropped tasks. Search before create; paginate with nextCursor.",
    inputSchema: object(
      {
        domainId: text(),
        projectId: text(),
        q: text(120),
        sourceKey: text(180),
        status,
        cursor: text(),
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      ["domainId"],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: "ryanos_task_read",
    description:
      "Read current task, references, taskPath and updatedAt version before patching.",
    inputSchema: object({ id: text() }, ["id"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "ryanos_task_create",
    description:
      "Create reviewed missing operational work using a stable sourceKey and brief source caption. reviewed=true asserts that intent/wording/provenance have been checked; resolve ambiguous handwriting first. Retry returns existing task without overwriting owner edits. Title is the concise next action; note holds details. No patient or employee-sensitive text.",
    inputSchema: object(
      {
        domainId: text(),
        sourceKey: text(180),
        ...patch,
        source: text(180),
        reviewed: { const: true, type: "boolean" },
        status: enumeration(["NOT_STARTED", "IN_PROGRESS", "WAITING"]),
        references: refs,
      },
      ["domainId", "sourceKey", "title", "source", "reviewed"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "ryanos_task_update",
    description:
      "Patch reviewed changes only, with the updatedAt version just read. Optionally bind sourceKey once when adopting a matching UI task, with a source caption. reviewed=true asserts intent/wording/provenance have been checked. Conflict requires reread/reconciliation; terminal tasks cannot reopen. References append without replacing owner references.",
    inputSchema: object(
      {
        id: text(),
        sourceKey: text(180),
        reviewed: { const: true, type: "boolean" },
        expectedUpdatedAt: { type: "string", format: "date-time" },
        patch: object(patch),
        addReferences: refs,
      },
      ["id", "reviewed", "expectedUpdatedAt", "patch"],
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
];

