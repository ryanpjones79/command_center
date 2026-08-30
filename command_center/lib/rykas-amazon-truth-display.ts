import { RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY } from "@/lib/rykas-amazon-truth-contract";

type Work = { requiredCapability: string; state: string };
type Event = { type: string; metadata: string | null; createdAt: Date };
export type AmazonTruthDisplay = { status: "REFRESHING" | "CURRENT" | "NEEDS ATTENTION" | "UNKNOWN"; ordersThrough: string | null; financialsThrough: string | null; inventoryThrough: string | null };

function metadata(value: string | null) {
  try { const parsed = JSON.parse(value ?? "null"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}

export function deriveAmazonTruthDisplay(workItems: Work[], events: Event[]): AmazonTruthDisplay {
  if (workItems.some((item) => item.requiredCapability === RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY && ["QUEUED", "PLANNING", "RUNNING", "VERIFYING", "RETRY"].includes(item.state))) return { status: "REFRESHING", ordersThrough: null, financialsThrough: null, inventoryThrough: null };
  const latest = events.filter((event) => ["RYKAS_AMAZON_TRUTH_CURRENT", "RYKAS_AMAZON_TRUTH_NEEDS_ATTENTION"].includes(event.type)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return { status: "UNKNOWN", ordersThrough: null, financialsThrough: null, inventoryThrough: null };
  if (latest.type === "RYKAS_AMAZON_TRUTH_NEEDS_ATTENTION") return { status: "NEEDS ATTENTION", ordersThrough: null, financialsThrough: null, inventoryThrough: null };
  const detail = metadata(latest.metadata);
  const safeDate = (key: string) => typeof detail[key] === "string" ? String(detail[key]).slice(0, 40) : null;
  return { status: "CURRENT", ordersThrough: safeDate("ordersThrough"), financialsThrough: safeDate("financialsThrough"), inventoryThrough: safeDate("inventoryThrough") };
}
