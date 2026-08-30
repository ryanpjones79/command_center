"use client";

import { useState } from "react";
import { saveRykasFinancialTruthAction } from "@/app/agent-hq/actions";
import { Button } from "@/components/ui/button";

const input = "mt-1 w-full rounded-md border bg-background px-3 py-2";
const label = "text-sm";
const section = "space-y-3 rounded-md border p-3";

export function RykasFinancialTruthForm({ decisionId }: { decisionId: string }) {
  const [debts, setDebts] = useState<number[]>([]);
  const [obligations, setObligations] = useState<number[]>([]);
  const add = (rows: number[], setRows: (value: number[]) => void) => setRows([...rows, (rows.at(-1) ?? 0) + 1]);

  return (
    <form action={saveRykasFinancialTruthAction} className="space-y-4 rounded-lg border bg-background/60 p-4">
      <input name="decisionId" type="hidden" value={decisionId} />
      <section className={section}>
        <h4 className="text-sm font-semibold">Cash</h4>
        <label className={label}>Current settled business cash<input className={input} min="0" name="businessCash" placeholder="$" step="0.01" type="number" /></label>
      </section>

      <section className={section}>
        <h4 className="text-sm font-semibold">Open commitments</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Owner-known total open commitments<input className={input} min="0" name="ownerCertifiedOpenCommitments" placeholder="$" step="0.01" type="number" /></label>
          <label className={label}>Optional note<input className={input} maxLength={1000} name="openCommitmentsNote" /></label>
          <label className={label}>Detailed PO truth
            <select className={input} name="poCertification" defaultValue=""><option value="">Leave unchanged / needs reconciliation</option><option value="CURRENT_NO_OPEN_POS">Detailed ledger current: no open POs</option><option value="CURRENT_OPEN_POS_LOADED">Detailed open POs are loaded</option></select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">The aggregate protects cash but never certifies the detailed PO ledger.</p>
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Obligations</h4><button className="rounded-md border px-3 py-1 text-sm" onClick={() => add(obligations, setObligations)} type="button">+ ADD OBLIGATION</button></div>
        <label className="flex items-center gap-2 text-sm"><input name="noUnrecordedObligations" type="checkbox" /> NO UNRECORDED OBLIGATIONS</label>
        <label className={label}>If truth cannot be completed
          <select className={input} name="obligationStatusOverride" defaultValue=""><option value="">Use rows or none certification</option><option value="NOT_AVAILABLE">Not available</option><option value="NEEDS_RECONCILIATION">Needs reconciliation</option></select>
        </label>
        {obligations.map((id) => <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2" key={id}>
          <label className={label}>Vendor<input className={input} maxLength={200} name="obligationVendor" /></label>
          <label className={label}>Description<input className={input} maxLength={1000} name="obligationDescription" /></label>
          <label className={label}>Amount due<input className={input} min="0.01" name="obligationAmount" step="0.01" type="number" /></label>
          <label className={label}>Due date<input className={input} name="obligationDueDate" type="date" /></label>
          <label className={label}>Category<input className={input} defaultValue="UNRECORDED_OBLIGATION" maxLength={80} name="obligationCategory" /></label>
          <label className={label}>Related PO ID (optional)<input className={input} min="1" name="obligationRelatedPo" step="1" type="number" /></label>
          <button className="rounded-md border px-3 py-1 text-sm sm:col-span-2" onClick={() => setObligations(obligations.filter((row) => row !== id))} type="button">REMOVE</button>
        </div>)}
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Debt</h4><button className="rounded-md border px-3 py-1 text-sm" onClick={() => add(debts, setDebts)} type="button">+ ADD DEBT</button></div>
        <label className="flex items-center gap-2 text-sm"><input name="noActiveDebt" type="checkbox" /> NO ACTIVE BUSINESS DEBT</label>
        <label className={label}>If truth cannot be completed
          <select className={input} name="debtStatusOverride" defaultValue=""><option value="">Use rows or none certification</option><option value="NOT_AVAILABLE">Not available</option><option value="NEEDS_RECONCILIATION">Needs reconciliation</option></select>
        </label>
        {debts.map((id) => <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2" key={id}>
          <label className={label}>Display name<input className={input} maxLength={160} name="debtDisplayName" /></label>
          <label className={label}>Debt type<input className={input} defaultValue="OTHER" maxLength={60} name="debtType" /></label>
          <label className={label}>Current balance<input className={input} min="0" name="debtBalance" step="0.01" type="number" /></label>
          <label className={label}>Pricing type<select className={input} defaultValue="APR" name="debtPricingType"><option value="APR">APR</option><option value="FIXED_FEE">Fixed fee</option><option value="REVENUE_BASED">Revenue based</option><option value="OTHER">Other</option><option value="UNKNOWN">Unknown</option></select></label>
          <label className={label}>APR % (APR only)<input className={input} max="100" min="0" name="debtAprPercent" step="0.01" type="number" /></label>
          <label className={label}>Minimum monthly payment<input className={input} min="0" name="debtMinimumPayment" step="0.01" type="number" /></label>
          <label className={label}>Next due date<input className={input} name="debtNextDueDate" type="date" /></label>
          <label className={label}>Promotional end<input className={input} name="debtPromotionalEnd" type="date" /></label>
          <label className={label}>Owner payoff priority<input className={input} max="100" min="1" name="debtOwnerPriority" step="1" type="number" /></label>
          <label className={label}>Remaining financing fee<input className={input} min="0" name="debtRemainingFee" step="0.01" type="number" /></label>
          <label className={label}>Remaining total repayment<input className={input} min="0" name="debtRemainingRepayment" step="0.01" type="number" /></label>
          <label className={label}>Payment cadence<input className={input} maxLength={30} name="debtPaymentCadence" placeholder="MONTHLY / WEEKLY" /></label>
          <label className={label}>Required periodic payment<input className={input} min="0" name="debtRequiredPeriodicPayment" step="0.01" type="number" /></label>
          <label className={label}>Notes<input className={input} maxLength={1000} name="debtNotes" /></label>
          <button className="rounded-md border px-3 py-1 text-sm sm:col-span-2" onClick={() => setDebts(debts.filter((row) => row !== id))} type="button">REMOVE</button>
        </div>)}
      </section>

      <section className={section}>
        <h4 className="text-sm font-semibold">Local inventory</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Garage/local inventory at cost<input className={input} min="0" name="localInventoryCostBasis" placeholder="$" step="0.01" type="number" /></label>
          <label className={label}>Location<select className={input} name="localInventoryLocation" defaultValue="GARAGE"><option value="GARAGE">Garage</option><option value="OTHER_LOCAL">Other local</option></select></label>
          <label className={label}>Confidence<select className={input} name="localInventoryConfidence" defaultValue="ESTIMATED"><option value="ESTIMATED">Estimated</option><option value="VERIFIED">Verified</option></select></label>
          <label className={label}>If unavailable<select className={input} name="localInventoryStatus" defaultValue=""><option value="">Leave unchanged</option><option value="NOT_AVAILABLE">Not available</option><option value="NEEDS_RECONCILIATION">Needs reconciliation</option></select></label>
          <label className={`${label} sm:col-span-2`}>Notes<input className={input} maxLength={1000} name="localInventoryNotes" /></label>
        </div>
      </section>

      <section className={section}>
        <h4 className="text-sm font-semibold">Owner policy</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Minimum operating reserve<input className={input} min="0" name="minimumOperatingReserve" step="0.01" type="number" /></label>
          <label className={label}>Minimum debt-payment buffer<input className={input} min="0" name="minimumDebtPaymentBuffer" step="0.01" type="number" /></label>
          <label className={label}>Desired extra monthly debt payment<input className={input} min="0" name="desiredMonthlyExtraDebtPayment" step="0.01" type="number" /></label>
          <label className={label}>Excess cash to debt %<input className={input} max="100" min="0" name="percentOfExcessCashToDebt" step="0.1" type="number" /></label>
          <label className={label}>Maximum discretionary inventory %<input className={input} max="100" min="0" name="maximumDiscretionaryInventoryPercent" step="0.1" type="number" /></label>
          <label className={label}>Maximum brand concentration %<input className={input} max="100" min="0" name="maximumBrandConcentrationPercent" step="0.1" type="number" /></label>
          <label className={label}>Speculative/test cap<input className={input} min="0" name="speculativeTestBudgetCap" step="0.01" type="number" /></label>
          <label className={label}>Debt strategy<select className={input} name="debtStrategy" defaultValue="HIGHEST_APR"><option value="HIGHEST_APR">Highest comparable APR</option><option value="OWNER_DEFINED_ORDER">Owner-defined</option></select></label>
        </div>
      </section>
      <Button type="submit">SAVE &amp; RECHECK</Button>
      <p className="text-xs text-muted-foreground">Saves only owner-confirmed planning facts in Rykas. It cannot place an order, move money, pay debt, or create a commitment.</p>
    </form>
  );
}
