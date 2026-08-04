"use server";

import { prisma } from "@/lib/prisma";
import { initialLeadFormState, leadSchema, type LeadFormState } from "@/lib/marketing/lead";

export async function submitLeadAction(_: LeadFormState = initialLeadFormState, formData: FormData): Promise<LeadFormState> {
  const parsed = leadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    businessType: formData.get("businessType"),
    revenueBand: formData.get("revenueBand"),
    amazonPresence: formData.get("amazonPresence"),
    multipleSellers: formData.get("multipleSellers"),
    pricingIssues: formData.get("pricingIssues"),
    supportNeed: formData.get("supportNeed"),
    catalogSize: formData.get("catalogSize"),
    primaryGoal: formData.get("primaryGoal"),
    timeline: formData.get("timeline"),
    message: formData.get("message"),
    requestedAsset: formData.get("requestedAsset"),
    source: formData.get("source")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please review the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  await prisma.contactLead.create({
    data: parsed.data
  });

  return {
    status: "success",
    message: parsed.data.requestedAsset
      ? "Playbook request received. Your details have been saved."
      : parsed.data.source === "assessment-page"
        ? "Assessment request received. Your details have been saved."
      : "Strategy request received. Your details have been saved."
  };
}
