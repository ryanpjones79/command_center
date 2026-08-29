import type { AgentActionCategory } from "@/lib/agent-policy";

export const localRunnerCapabilities = [
  "REPOSITORY_READ",
  "REPOSITORY_CHANGE",
  "RUN_TESTS",
  "CODEX_IMPLEMENTATION",
  "CODEX_REVIEW"
] as const;

export const SIGNALCARE_WEB_RESEARCH_CAPABILITY =
  "SIGNALCARE_PUBLIC_WEB_RESEARCH" as const;

export const hostedAgentCapabilities = [SIGNALCARE_WEB_RESEARCH_CAPABILITY] as const;

export const phase2AllowedCapabilities = [
  ...localRunnerCapabilities,
  ...hostedAgentCapabilities
] as const;

export type AgentCapability = (typeof phase2AllowedCapabilities)[number];

const prohibitedCapabilities = new Set([
  "SEND_EMAIL", "SEND_SMS", "PURCHASE", "MODIFY_PRICE", "PRODUCTION_DEPLOY",
  "DELETE_EXTERNAL_RESOURCE", "CHANGE_CREDENTIAL", "UNRESTRICTED_SHELL"
]);

export function isRegisteredCapability(value: string): value is AgentCapability {
  return (phase2AllowedCapabilities as readonly string[]).includes(value);
}

export function assertPhase2Capability(value: string) {
  if (prohibitedCapabilities.has(value) || !isRegisteredCapability(value)) {
    throw new Error(`Capability ${value} is not registered for Phase 2A.`);
  }
  return value;
}

export function assertLocalRunnerCapability(value: string) {
  if (!(localRunnerCapabilities as readonly string[]).includes(value)) {
    throw new Error(`Capability ${value} is not registered for the local runner.`);
  }
  return value as (typeof localRunnerCapabilities)[number];
}

export function executorForCapability(value: string) {
  if ((localRunnerCapabilities as readonly string[]).includes(value)) {
    return "LOCAL_RUNNER" as const;
  }
  if ((hostedAgentCapabilities as readonly string[]).includes(value)) {
    return "CONTROL_PLANE" as const;
  }
  return null;
}

export function defaultCapabilityForCategory(category: AgentActionCategory): AgentCapability {
  return category === "REVERSIBLE_REPOSITORY_WORK" ? "CODEX_IMPLEMENTATION" : "REPOSITORY_READ";
}
