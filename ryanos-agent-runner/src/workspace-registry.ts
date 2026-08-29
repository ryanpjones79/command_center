import { realpathSync } from "node:fs";
import path from "node:path";
import type { Workspace } from "./config.js";
import type { Capability } from "./types.js";

export function resolveWorkspace(registry: Record<string, Workspace>, identifier: string, capability: Capability) {
  const workspace = registry[identifier];
  if (!workspace) throw new Error(`Unregistered workspace: ${identifier}`);
  if (workspace.sensitivity === "CCHCS_SENSITIVE") throw new Error("Sensitive CCHCS workspaces are denied in Phase 2A.");
  if (!workspace.capabilities.includes(capability)) throw new Error(`Workspace does not allow ${capability}.`);
  if (workspace.networkPolicy !== "OFF") throw new Error("Network-enabled workspaces are not enabled in Phase 2A.");
  const canonicalPath = realpathSync.native(path.resolve(workspace.canonicalPath));
  return { ...workspace, canonicalPath };
}
