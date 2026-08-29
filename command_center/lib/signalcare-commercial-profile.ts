import { z } from "zod";

export const signalCareApprovedOfferIds = [
  "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
  "HEALTHCARE_OPERATIONAL_VISIBILITY_WORKFLOW_DIAGNOSTIC",
  "ANALYTICS_REPORTING_MODERNIZATION"
] as const;

export const signalCareApprovedOfferSchema = z.enum(
  signalCareApprovedOfferIds
);

export type SignalCareApprovedOffer = z.infer<
  typeof signalCareApprovedOfferSchema
>;

export const signalCareCommercialProfile = {
  offers: [
    {
      id: "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
      name: "Dental Revenue Leakage Diagnostic",
      customers: "Multi-location dental groups, DSOs, and practices",
      scope:
        "Scheduling, unscheduled treatment, follow-up, revenue visibility, and reporting consistency"
    },
    {
      id: "HEALTHCARE_OPERATIONAL_VISIBILITY_WORKFLOW_DIAGNOSTIC",
      name: "Healthcare Operational Visibility / Workflow Diagnostic",
      customers: "Healthcare and provider organizations",
      scope:
        "Workflow bottlenecks, scheduling and referral visibility, and operational reporting"
    },
    {
      id: "ANALYTICS_REPORTING_MODERNIZATION",
      name: "Analytics / Reporting Modernization",
      customers: "Organizations that plausibly buy analytics modernization services",
      scope:
        "Power BI, SQL and reporting logic, measure validation, operational dashboards and command centers, and Oracle Health/Cerner analytics where relevant"
    }
  ],
  prohibitedPositioning: [
    "post-procedure patient monitoring platform",
    "remote patient monitoring vendor",
    "cardiac monitoring platform"
  ],
  customerRule:
    "Prefer prospective customers. Do not treat a technology vendor as a partnership opportunity unless public evidence shows that organization plausibly needs and could buy an approved SignalCare service."
} as const;

export function signalCareCommercialProfileInstructions() {
  return `Canonical SignalCare commercial profile: ${JSON.stringify(signalCareCommercialProfile)}. Every prospect and qualification must map to exactly one approved offer ID. SignalCare is not any prohibited product or platform. Prefer plausible customers, not speculative technology partnerships.`;
}

export function containsProhibitedSignalCarePositioning(values: unknown[]) {
  const text = values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return signalCareCommercialProfile.prohibitedPositioning.some((phrase) =>
    text.includes(phrase.toLowerCase())
  );
}
