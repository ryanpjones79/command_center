import { z } from "zod";

export const notebookEntryTypes = [
  { value: "insight", label: "Insight" },
  { value: "decision", label: "Decision" },
  { value: "project_note", label: "Project Note" },
  { value: "spiritual_reflection", label: "Spiritual Reflection" },
  { value: "meeting", label: "Meeting" },
  { value: "idea", label: "Idea" },
  { value: "reference", label: "Reference" }
] as const;

export type NotebookEntryTypeValue = (typeof notebookEntryTypes)[number]["value"];

export const notebookEntryTypeValues = notebookEntryTypes.map((type) => type.value) as [
  NotebookEntryTypeValue,
  ...NotebookEntryTypeValue[]
];

export function formatNotebookEntryType(value: string) {
  return notebookEntryTypes.find((type) => type.value === value)?.label ?? value;
}

function blankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalDateInput(value: unknown) {
  const normalized = blankToNull(value);
  if (!normalized || typeof normalized !== "string") return null;
  return new Date(`${normalized}T00:00:00`);
}

export const notebookSchema = z.object({
  title: z.string().trim().min(1, "Notebook title is required"),
  number: z.preprocess(
    blankToNull,
    z.coerce.number().int().positive("Notebook number must be positive").nullable().optional()
  ),
  startedAt: z.preprocess(optionalDateInput, z.date().nullable().optional()),
  completedAt: z.preprocess(optionalDateInput, z.date().nullable().optional()),
  description: z.preprocess(blankToNull, z.string().max(800).nullable().optional())
});

export const notebookEntrySchema = z.object({
  notebookId: z.string().min(1, "Notebook is required"),
  pageNumber: z.coerce.number().int().positive("Page number is required"),
  title: z.string().trim().min(1, "Title is required"),
  entryType: z.enum(notebookEntryTypeValues),
  date: z.preprocess(optionalDateInput, z.date().nullable().optional()),
  summary: z.preprocess(blankToNull, z.string().max(1200).nullable().optional()),
  domainId: z.preprocess(blankToNull, z.string().nullable().optional()),
  projectId: z.preprocess(blankToNull, z.string().nullable().optional())
});
