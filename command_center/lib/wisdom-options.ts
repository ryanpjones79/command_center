import { z } from "zod";

export const wisdomSourceTypes = [
  { value: "book", label: "Book" },
  { value: "podcast", label: "Podcast" },
  { value: "article", label: "Article" },
  { value: "conversation", label: "Conversation" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "personal_insight", label: "Personal insight" },
  { value: "other", label: "Other" }
] as const;

export const wisdomCategories = [
  "Mindset",
  "Relationships",
  "Work & Leadership",
  "Business",
  "Money",
  "Health & Fitness",
  "Parenting / Family",
  "Stoicism",
  "Buddhism / Hinduism",
  "Productivity / Focus",
  "Personal Growth",
  "Other"
] as const;

export const wisdomStatuses = ["inbox", "library", "archived"] as const;

export type WisdomSourceType = (typeof wisdomSourceTypes)[number]["value"];
export type WisdomCategory = (typeof wisdomCategories)[number];
export type WisdomStatus = (typeof wisdomStatuses)[number];

const sourceTypeValues = wisdomSourceTypes.map((type) => type.value) as [
  WisdomSourceType,
  ...WisdomSourceType[]
];

const categoryValues = wisdomCategories as unknown as [
  WisdomCategory,
  ...WisdomCategory[]
];

const statusValues = wisdomStatuses as unknown as [
  WisdomStatus,
  ...WisdomStatus[]
];

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

export function formatWisdomSourceType(value: string) {
  return wisdomSourceTypes.find((type) => type.value === value)?.label ?? value;
}

export function parseWisdomTags(value: string | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const wisdomEntrySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  idea: z.string().trim().min(1, "Main idea is required").max(3000),
  takeaway: z.preprocess(blankToNull, z.string().max(2000).nullable().optional()),
  application: z.preprocess(blankToNull, z.string().max(2000).nullable().optional()),
  sourceType: z.enum(sourceTypeValues).default("other"),
  sourceName: z.preprocess(blankToNull, z.string().max(240).nullable().optional()),
  author: z.preprocess(blankToNull, z.string().max(160).nullable().optional()),
  reference: z.preprocess(blankToNull, z.string().max(120).nullable().optional()),
  category: z.enum(categoryValues).default("Other"),
  capturedAt: z.preprocess(optionalDateInput, z.date().nullable().optional()),
  favorite: z.boolean().default(false),
  active: z.boolean().default(false),
  tags: z.preprocess(blankToNull, z.string().max(500).nullable().optional()),
  photoUrl: z.preprocess(blankToNull, z.string().max(800).nullable().optional()),
  status: z.enum(statusValues).default("library"),
  notebookEntryId: z.preprocess(blankToNull, z.string().nullable().optional())
});

export const wisdomInboxSchema = z.object({
  idea: z.string().trim().min(1, "Idea is required").max(3000),
  photoUrl: z.preprocess(blankToNull, z.string().max(800).nullable().optional()),
  sourceType: z.enum(sourceTypeValues).default("other"),
  sourceName: z.preprocess(blankToNull, z.string().max(240).nullable().optional())
});

export const wisdomReflectionSchema = z.object({
  text: z.string().trim().min(1, "Reflection is required").max(1200)
});
