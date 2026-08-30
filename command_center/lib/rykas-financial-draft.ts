export type RykasFinancialDraft = {
  version: 1;
  debtCount: number;
  obligationCount: number;
  fields: Record<string, string[]>;
};

export type RykasOwnerUpdateStatus = "IDLE" | "PROCESSING" | "NEEDS_ATTENTION" | "SAVED";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rykasFinancialDraftKey(decisionId: string) {
  return `rykas-financial-draft:${decisionId}`;
}

export function saveRykasFinancialDraft(storage: DraftStorage, key: string, draft: RykasFinancialDraft) {
  try {
    storage.setItem(key, JSON.stringify(draft));
  } catch {
    // Browser storage can be disabled; form submission still remains bounded and inline-safe.
  }
}

export function loadRykasFinancialDraft(storage: DraftStorage, key: string): RykasFinancialDraft | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null") as Partial<RykasFinancialDraft> | null;
    if (!parsed || parsed.version !== 1 || !parsed.fields || typeof parsed.fields !== "object") return null;
    return {
      version: 1,
      debtCount: Math.max(0, Math.min(20, Number(parsed.debtCount) || 0)),
      obligationCount: Math.max(0, Math.min(25, Number(parsed.obligationCount) || 0)),
      fields: parsed.fields
    };
  } catch {
    return null;
  }
}

export function clearRykasFinancialDraftAfterConfirmedSave(storage: DraftStorage, key: string, status: RykasOwnerUpdateStatus) {
  if (status === "SAVED") {
    try {
      storage.removeItem(key);
    } catch {
      // A stale local draft is safer than clearing before a confirmed save.
    }
  }
}

export function safeRykasOwnerUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("503") || message.includes("unavailable") || message.includes("connection")) {
    return "Rykas truth is temporarily unavailable. Your entries are preserved; retry when the service is available.";
  }
  if (message.includes("numeric") || message.includes("validation") || message.includes("invalid") || message.includes("requires") || message.includes("zod")) {
    return "Check the highlighted financial entries and numeric values, then try again. Your draft is preserved.";
  }
  if (message.includes("already processing")) {
    return "This financial truth update is already processing. Your preserved submission will not be replaced.";
  }
  return "The financial truth update could not be confirmed. Your entries are preserved and no financial action occurred.";
}
