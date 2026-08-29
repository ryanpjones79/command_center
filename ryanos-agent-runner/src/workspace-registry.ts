import { realpathSync } from "node:fs";
import path from "node:path";
import type { Workspace } from "./config.js";
import type { Capability } from "./types.js";

export function resolveWorkspace(registry: Record<string, Workspace>, identifier: string, capability: Capability) {
  const workspace = registry[identifier];
  if (!workspace) throw new Error(`Unregistered workspace: ${identifier}`);
  if (workspace.sensitivity === "CCHCS_SENSITIVE") throw new Error("Sensitive CCHCS workspaces are denied in Phase 2A.");
  if (!workspace.capabilities.includes(capability)) throw new Error(`Workspace does not allow ${capability}.`);
  if (capability === "RYKAS_OPERATIONS_READ") {
    if (identifier !== "rykas-repo" || workspace.projectSlug !== "rykas") throw new Error("Rykas truth reads require the fixed rykas-repo workspace.");
    if (workspace.networkPolicy !== "LOCALHOST_ONLY" || workspace.sensitivity !== "STANDARD") throw new Error("Rykas truth reads require the standard localhost-only boundary.");
  } else if (workspace.networkPolicy !== "OFF") throw new Error("Network-enabled workspaces are not enabled for repository capabilities.");
  const canonicalPath = realpathSync.native(path.resolve(workspace.canonicalPath));
  return { ...workspace, canonicalPath };
}
