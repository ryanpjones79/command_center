// Secondary Tools launcher. Links only (RyanOS stays read-only toward these
// apps). Unknown destinations are shown as "not configured", never guessed.
//
// Override any entry with an env var, e.g. RYANOS_TOOL_AP_TRADER=https://...

export type ToolLink = { key: string; label: string; href: string | null; note: string };

const SUPPLIER_OS = "https://rykas-supplier-os.up.railway.app";

const TOOLS: { key: string; label: string; env: string; fallback: string | null; note: string }[] = [
  { key: "RYKAS", label: "Rykas Supplier OS", env: "RYANOS_TOOL_RYKAS", fallback: `${SUPPLIER_OS}/sourcing/commercial`, note: "Sourcing, suppliers, reorders" },
  { key: "EBAY", label: "eBay workstation", env: "RYANOS_TOOL_EBAY", fallback: `${SUPPLIER_OS}/sourcing/ebay`, note: "Research and listings" },
  { key: "STORE_ROUTE", label: "Store route", env: "RYANOS_TOOL_STORE_ROUTE", fallback: `${SUPPLIER_OS}/sourcing/store-route`, note: "Retail-arbitrage routes" },
  { key: "AP_TRADER", label: "AP Trader", env: "RYANOS_TOOL_AP_TRADER", fallback: null, note: "Trading operations" },
  { key: "CASINO_AP", label: "Casino AP", env: "RYANOS_TOOL_CASINO_AP", fallback: null, note: "Offers and opportunities" },
  { key: "CCHCS", label: "CCHCS resources", env: "RYANOS_TOOL_CCHCS", fallback: null, note: "Approved work systems only" }
];

export function resolveTools(env: Record<string, string | undefined> = process.env): ToolLink[] {
  return TOOLS.map((tool) => {
    const raw = env[tool.env]?.trim();
    const href = raw && /^https:\/\//.test(raw) ? raw : tool.fallback;
    return { key: tool.key, label: tool.label, href, note: href ? tool.note : "Not configured" };
  });
}
