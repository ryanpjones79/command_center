import { z } from "zod";

export const addTickerSchema = z.object({
  symbol: z.string().min(1).max(10),
  sector: z.string().max(40).optional(),
  manualIvrBucket: z.string().max(20).optional(),
  nextEarningsDate: z.string().optional()
});

export const settingsSchema = z.object({
  accountSize: z.coerce.number().nonnegative().optional(),
  maxRiskPerTradePercent: z.coerce.number().positive().max(100),
  preferredDteMin: z.coerce.number().int().min(7).max(120),
  preferredDteMax: z.coerce.number().int().min(7).max(180),
  definedRiskOnly: z.coerce.boolean(),
  earningsBufferDays: z.coerce.number().int().min(0).max(21),
  concentrationLimit: z.coerce.number().int().min(1).max(20)
});
