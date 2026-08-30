export type OperatorIssue = { summary: string; technicalEvidence: string | null };

function normalize(value: string) {
  return value.replaceAll("\\n", " ").replace(/\s+/g, " ").trim();
}

export function operatorIssue(value: string | null | undefined): OperatorIssue {
  if (!value?.trim()) return { summary: "No blocker recorded.", technicalEvidence: null };
  const raw = value.trim();
  const normalized = normalize(raw);
  const isRykasContract = /rykas/i.test(normalized) &&
    /(zod|contract|validation|openPurchaseOrders|openLines|inventoryCapitalPosition|financialSnapshot)/i.test(normalized);
  if (isRykasContract) {
    return {
      summary: "Rykas read contract mismatch. V1.1 financial truth was rejected by the local runner; no financial truth was altered. Action: update or restart the runner.",
      technicalEvidence: raw
    };
  }
  const isStructuredValidation = /^[\[{]/.test(normalized) || /(ZodError|invalid_type|unrecognized_keys)/i.test(normalized);
  if (isStructuredValidation) {
    return {
      summary: "Technical validation failed. No external action occurred; review technical evidence.",
      technicalEvidence: raw
    };
  }
  return {
    summary: normalized.length > 280 ? `${normalized.slice(0, 277).trimEnd()}…` : normalized,
    technicalEvidence: normalized.length > 280 ? raw : null
  };
}

export function groupRecentEvents<T extends { id: string; summary: string; project: { name: string } }>(
  events: T[],
  limit = 12
) {
  const grouped = new Map<string, T & { operatorSummary: string; repeatCount: number; technicalEvidence: string | null }>();
  for (const event of events) {
    const issue = operatorIssue(event.summary);
    const key = `${event.project.name}\u0000${issue.summary}`;
    const existing = grouped.get(key);
    if (existing) existing.repeatCount += 1;
    else grouped.set(key, { ...event, operatorSummary: issue.summary, repeatCount: 1, technicalEvidence: issue.technicalEvidence });
  }
  return [...grouped.values()].slice(0, Math.max(1, Math.min(limit, 25)));
}
