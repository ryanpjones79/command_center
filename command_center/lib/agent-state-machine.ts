import type { AgentWorkState } from "@prisma/client";

export const activeAgentWorkStates: AgentWorkState[] = [
  "QUEUED",
  "PLANNING",
  "RUNNING",
  "VERIFYING",
  "RETRY",
  "AWAITING_EXECUTION"
];

export const terminalAgentWorkStates: AgentWorkState[] = ["DONE", "READY_FOR_REVIEW", "FAILED", "PARKED"];

export const legalAgentWorkTransitions: Record<AgentWorkState, AgentWorkState[]> = {
  QUEUED: ["PLANNING", "PARKED", "FAILED"],
  PLANNING: ["RUNNING", "NEEDS_RYAN", "PARKED", "FAILED"],
  RUNNING: ["VERIFYING", "RETRY", "NEEDS_RYAN", "FAILED", "PARKED"],
  VERIFYING: ["DONE", "RETRY", "NEEDS_RYAN", "FAILED", "PARKED"],
  RETRY: ["PLANNING", "NEEDS_RYAN", "FAILED", "PARKED"],
  NEEDS_RYAN: ["QUEUED", "AWAITING_EXECUTION", "DONE", "FAILED", "PARKED"],
  AWAITING_EXECUTION: ["RUNNING", "FAILED", "PARKED"],
  READY_FOR_REVIEW: [],
  DONE: [],
  FAILED: [],
  PARKED: ["QUEUED"]
};

export function canTransitionAgentWorkItem(from: AgentWorkState, to: AgentWorkState) {
  return legalAgentWorkTransitions[from].includes(to);
}

export function assertAgentWorkTransition(from: AgentWorkState, to: AgentWorkState) {
  if (!canTransitionAgentWorkItem(from, to)) {
    throw new Error(`Illegal AgentWorkItem transition: ${from} -> ${to}`);
  }
}

export function isAgentWorkActive(state: AgentWorkState) {
  return activeAgentWorkStates.includes(state);
}
