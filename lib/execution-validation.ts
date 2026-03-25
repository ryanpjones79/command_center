import { z } from "zod";

const dobRegex =
  /\b(?:DOB|Date of Birth)\s*[:\-]?\s*(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/i;
const mrnRegex = /\b(?:MRN|Medical\s*Record\s*Number)\s*[:\-]?\s*[A-Z0-9]{6,12}\b/i;
const nameDobRegex =
  /\b([A-Z][a-z]+\s+[A-Z][a-z]+).{0,30}(?:DOB|Date of Birth|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i;

export function detectPhi(text: string): string[] {
  const warnings: string[] = [];
  if (dobRegex.test(text)) warnings.push("Potential DOB detected");
  if (mrnRegex.test(text)) warnings.push("Potential MRN detected");
  if (nameDobRegex.test(text)) warnings.push("Potential name + DOB pattern detected");
  return warnings;
}

export const executionDomainSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80),
  description: z.string().max(400).optional()
});

export const executionProjectSchema = z.object({
  domainId: z.string().cuid(),
  name: z.string().min(2).max(140),
  status: z.enum(["ON_TRACK", "NEEDS_ATTENTION", "BLOCKED", "COMPLETED"]),
  activeStatus: z.enum(["ACTIVE_NOW", "ACTIVE_LATER", "PARKED", "COMPLETED"]),
  weeklyFocus: z.enum(["TOP_3", "ACTIVE", "NONE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  nextAction: z.string().max(500).optional(),
  waitingOn: z.string().max(180).optional(),
  blocked: z.coerce.boolean().default(false),
  note: z.string().max(1000).optional()
});

export const executionTaskSchema = z.object({
  domainId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  title: z.string().min(2).max(180),
  type: z.enum(["ACTION", "FOLLOW_UP", "ADMIN", "QUICK_WIN"]),
  estimatedDuration: z
    .enum(["UNDER_30_MIN", "THIRTY_TO_SIXTY_MIN", "ONE_TO_TWO_HOURS", "TWO_HOURS_PLUS"])
    .optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING", "DONE", "DROPPED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  whenBucket: z.enum(["TODAY", "THIS_WEEK", "LATER", "WAITING", "PARKING_LOT"]),
  dueDate: z.string().optional(),
  followUpDate: z.string().optional(),
  waitingOn: z.string().max(180).optional(),
  note: z.string().max(1000).optional(),
  source: z.string().max(180).optional(),
  isBlocked: z.coerce.boolean().default(false),
  pinToTodayUntilDone: z.coerce.boolean().default(false)
});
