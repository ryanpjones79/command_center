// Who holds an action right now: an agent still preparing it, or Ryan, ready to do it.
//
// No new columns: an action an agent is preparing is WAITING with waitingOn starting "Agent" (for example
// "Agent: drafting the profile"). When the agent finishes it attaches the draft or source as a task
// reference (ExecutionTaskReference) and sets the task back to NOT_STARTED with waitingOn cleared, which
// makes it ready for Ryan. Ryan can also take an item over before the agent finishes.

export const AGENT_PREFIX = "Agent";

export type Readiness = "preparing" | "ready";

export function isAgentWaiting(waitingOn: string | null | undefined) {
  return Boolean(waitingOn && /^agent\b/i.test(waitingOn.trim()));
}

export function readiness(task: { status: string; waitingOn: string | null }): Readiness {
  return task.status === "WAITING" && isAgentWaiting(task.waitingOn) ? "preparing" : "ready";
}

// "Agent: drafting the profile" -> "drafting the profile"; plain "Agent" -> null.
export function agentDoing(waitingOn: string | null | undefined) {
  const rest = (waitingOn ?? "").trim().replace(/^agent\b[:\s-]*/i, "");
  return rest || null;
}

// Linked drafts and sources: only web links and RyanOS paths are opened from the board.
export function safeLink(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return /^https:\/\//i.test(url) ? url : null;
}
