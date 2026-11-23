import type { QuickTarget } from "@/lib/v2/quick-add";

// Plan screen helpers with no UI: source labels, search and quick filters, #-project suggestions.

type FilterableTask = { title: string; projectName: string | null; areaName: string; source: string | null; waitingOn: string | null; urgent: boolean; start: string | null };

export const SOURCE_LABEL: Record<string, string> = {
  EBAY: "eBay", RYKAS: "Supplier OS", STORE_ROUTE: "Store route", AP_TRADER: "AP Trader", CASINO_AP: "Field Book", CCHCS: "CCHCS", EMAIL: "Email"
};

export type QuickFilter = "due" | "apps" | "mine" | "unscheduled";
export const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "due", label: "Due soon" },
  { key: "apps", label: "From apps" },
  { key: "mine", label: "Mine" },
  { key: "unscheduled", label: "Not scheduled" }
];

// Search matches the task, its project, its area and where it came from.
export function taskMatches(task: FilterableTask, query: string, quick: Set<QuickFilter>) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [task.title, task.projectName, task.areaName, task.source ? SOURCE_LABEL[task.source] ?? task.source : "", task.waitingOn].join(" ").toLowerCase();
  if (!words.every((word) => haystack.includes(word))) return false;
  if (quick.has("due") && !task.urgent) return false;
  if (quick.has("apps") && !task.source) return false;
  if (quick.has("mine") && task.source) return false;
  if (quick.has("unscheduled") && task.start) return false;
  return true;
}

const squashText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export const TAG_AT_END = /(^|\s)#(\S*)$/;

// Projects (and areas) whose name contains what was typed after "#"; projects first, shortest names first.
export function suggestTargets(query: string, targets: QuickTarget[], limit = 6) {
  const key = squashText(query);
  return targets
    .filter((target) => !key || squashText(target.name).includes(key) || squashText(target.slug ?? "").startsWith(key))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "PROJECT" ? -1 : 1) || Number(!squashText(a.name).startsWith(key)) - Number(!squashText(b.name).startsWith(key)) || a.name.length - b.name.length)
    .slice(0, limit);
}
