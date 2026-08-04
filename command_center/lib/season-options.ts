import { z } from "zod";

export const seasonStatuses = ["PLANNED", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;

export const seasonIconOptions = [
  "Building",
  "Recovery",
  "Adventure",
  "Learning",
  "Family",
  "Health",
  "Relationship",
  "Custom"
] as const;

export const seasonThemeColors = [
  { label: "Cedar", value: "#0f766e" },
  { label: "River", value: "#2563eb" },
  { label: "Amber", value: "#d97706" },
  { label: "Slate", value: "#475569" },
  { label: "Rosewood", value: "#be123c" },
  { label: "Moss", value: "#65a30d" }
] as const;

export function formatSeasonStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const optionalDateString = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value : undefined));

export const seasonSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(600).optional(),
  startedAt: optionalDateString,
  completedAt: optionalDateString,
  status: z.enum(seasonStatuses).default("ACTIVE"),
  themeColor: z.string().max(32).optional(),
  icon: z.string().max(40).optional(),
  isCurrent: z.coerce.boolean().default(false)
});
