"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitLeadAction } from "@/app/contact/actions";
import { initialLeadFormState } from "@/lib/marketing/lead";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="premium-cta inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold shadow-[0_18px_42px_rgba(16,185,129,0.22)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting..." : "Request Assessment"}
    </button>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

export function AssessmentForm() {
  const [state, action] = useActionState(submitLeadAction, initialLeadFormState);

  return (
    <form action={action} className="grid gap-5">
      <input name="source" type="hidden" value="assessment-page" />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.name?.[0]} label="Name">
          <Input
            className={cn("h-12 rounded-2xl border-border/80 bg-background/80", state.fieldErrors?.name && "border-destructive")}
            name="name"
            placeholder="Your name"
            required
          />
        </Field>
        <Field error={state.fieldErrors?.email?.[0]} label="Work email">
          <Input
            className={cn("h-12 rounded-2xl border-border/80 bg-background/80", state.fieldErrors?.email && "border-destructive")}
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.company?.[0]} label="Company">
          <Input className="h-12 rounded-2xl border-border/80 bg-background/80" name="company" placeholder="Brand or company name" />
        </Field>
        <Field error={state.fieldErrors?.amazonPresence?.[0]} label="Are you already on Amazon?">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="amazonPresence">
            <option value="">Select one</option>
            <option value="not-yet">Not yet</option>
            <option value="just-starting">Early presence</option>
            <option value="active">Yes, active on Amazon</option>
            <option value="unsure">Not sure how to classify it</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.multipleSellers?.[0]} label="Are multiple sellers involved?">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="multipleSellers">
            <option value="">Select one</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="not-sure">Not sure</option>
          </select>
        </Field>
        <Field error={state.fieldErrors?.pricingIssues?.[0]} label="Are pricing inconsistencies a problem?">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="pricingIssues">
            <option value="">Select one</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="emerging">Starting to become one</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.supportNeed?.[0]} label="What kind of support do you need?">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="supportNeed">
            <option value="">Select one</option>
            <option value="launch">Launch support</option>
            <option value="cleanup">Cleanup and channel control</option>
            <option value="ongoing-management">Ongoing management</option>
            <option value="mixed">A mix of those needs</option>
          </select>
        </Field>
        <Field error={state.fieldErrors?.catalogSize?.[0]} label="Rough catalog size">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="catalogSize">
            <option value="">Select one</option>
            <option value="1-10">1-10 SKUs</option>
            <option value="11-50">11-50 SKUs</option>
            <option value="51-200">51-200 SKUs</option>
            <option value="200-plus">200+ SKUs</option>
          </select>
        </Field>
      </div>

      <Field error={state.fieldErrors?.message?.[0]} label="Anything else we should know?">
        <Textarea
          className={cn("min-h-[120px] rounded-[1.5rem] border-border/80 bg-background/80", state.fieldErrors?.message && "border-destructive")}
          name="message"
          placeholder="Optional: share a quick note on launch timing, seller issues, listing quality, advertising, or internal bandwidth."
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {state.message || "We use this intake to quickly understand whether the right next step is launch planning, cleanup, or ongoing channel support."}
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
