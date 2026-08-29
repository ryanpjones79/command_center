export const agentActionCategories = [
  "RESEARCH_READ_ONLY",
  "REVERSIBLE_REPOSITORY_WORK",
  "EXTERNAL_COMMUNICATION",
  "SEND_EMAIL_OR_MESSAGE",
  "SPEND_MONEY",
  "PURCHASE_INVENTORY",
  "CHANGE_PRICES",
  "CHANGE_ECONOMIC_GUARDRAILS",
  "CHANGE_BUSINESS_OFFER",
  "PRODUCTION_DEPLOYMENT",
  "DESTRUCTIVE_OPERATION",
  "CREDENTIALS_OR_SECRETS",
  "EXTERNAL_ACCOUNT_MODIFICATION",
  "BINDING_COMMITMENT",
  "PERSONNEL_MATTER",
  "CCHCS_PROJECT_MANAGEMENT",
  "CCHCS_METHODOLOGY_DECISION",
  "CCHCS_POLICY_STATEMENT",
  "CCHCS_EXECUTIVE_COMMUNICATION",
  "CCHCS_PRODUCTION_RISK",
  "CCHCS_SENSITIVE_CONTENT",
  "PHI_EXTERNAL_TRANSFER"
] as const;

export type AgentActionCategory = (typeof agentActionCategories)[number];
export type AgentPolicyOutcome = "ALLOW" | "REQUIRE_OWNER_APPROVAL" | "DENY";

export type AgentPolicyContext = {
  category: AgentActionCategory;
  projectProfile?: string | null;
  containsPotentialPhi?: boolean;
  leavesApprovedBoundary?: boolean;
  amountCents?: number | null;
  spendingThresholdCents?: number | null;
};

const alwaysDenied = new Set<AgentActionCategory>([
  "DESTRUCTIVE_OPERATION",
  "CREDENTIALS_OR_SECRETS",
  "PHI_EXTERNAL_TRANSFER"
]);

const ownerGated = new Set<AgentActionCategory>([
  "EXTERNAL_COMMUNICATION",
  "SEND_EMAIL_OR_MESSAGE",
  "SPEND_MONEY",
  "PURCHASE_INVENTORY",
  "CHANGE_PRICES",
  "CHANGE_ECONOMIC_GUARDRAILS",
  "CHANGE_BUSINESS_OFFER",
  "PRODUCTION_DEPLOYMENT",
  "EXTERNAL_ACCOUNT_MODIFICATION",
  "BINDING_COMMITMENT",
  "PERSONNEL_MATTER",
  "CCHCS_METHODOLOGY_DECISION",
  "CCHCS_POLICY_STATEMENT",
  "CCHCS_EXECUTIVE_COMMUNICATION",
  "CCHCS_PRODUCTION_RISK"
]);

export function evaluateAgentPolicy(context: AgentPolicyContext): AgentPolicyOutcome {
  if (!(agentActionCategories as readonly string[]).includes(context.category)) return "DENY";
  if (alwaysDenied.has(context.category)) return "DENY";

  if (
    context.category === "CCHCS_SENSITIVE_CONTENT" ||
    (context.containsPotentialPhi && context.leavesApprovedBoundary)
  ) {
    return "DENY";
  }

  if (ownerGated.has(context.category)) return "REQUIRE_OWNER_APPROVAL";

  if (context.projectProfile === "CCHCS_PM" && context.containsPotentialPhi) {
    return "DENY";
  }

  return "ALLOW";
}

export function policyOutcomeExplanation(outcome: AgentPolicyOutcome) {
  if (outcome === "ALLOW") return "Deterministic policy permits this bounded action.";
  if (outcome === "REQUIRE_OWNER_APPROVAL") {
    return "Deterministic policy requires a durable owner decision before action.";
  }
  return "Deterministic policy prohibits this action in the current boundary.";
}
