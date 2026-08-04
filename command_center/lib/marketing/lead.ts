import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().email("Please enter a valid email."),
  company: optionalText,
  businessType: optionalText,
  revenueBand: optionalText,
  amazonPresence: optionalText,
  multipleSellers: optionalText,
  pricingIssues: optionalText,
  supportNeed: optionalText,
  catalogSize: optionalText,
  primaryGoal: optionalText,
  timeline: optionalText,
  message: z
    .string()
    .trim()
    .max(2000, "Please keep the message under 2000 characters.")
    .transform((value) => value || undefined)
    .optional(),
  requestedAsset: optionalText,
  source: optionalText
});

export type LeadFormValues = z.infer<typeof leadSchema>;

export type LeadFormState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Partial<Record<keyof LeadFormValues, string[]>>;
};

export const initialLeadFormState: LeadFormState = {
  status: "idle",
  message: ""
};
