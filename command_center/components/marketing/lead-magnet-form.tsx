"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitLeadAction } from "@/app/contact/actions";
import { initialLeadFormState } from "@/lib/marketing/lead";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function LeadMagnetButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting..." : "Get the Brief"}
    </button>
  );
}

export function LeadMagnetForm({ source = "brief-request" }: { source?: string }) {
  const [state, action] = useActionState(submitLeadAction, initialLeadFormState);

  return (
    <form action={action} className="grid gap-4">
      <input name="requestedAsset" type="hidden" value="Amazon Launch & Channel Control Brief" />
      <input name="source" type="hidden" value={source} />
      <input name="primaryGoal" type="hidden" value="playbook-download" />

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          className={cn("h-12 rounded-2xl border-border/80 bg-background/80", state.fieldErrors?.name && "border-destructive")}
          name="name"
          placeholder="Your name"
          required
        />
        <Input
          className={cn("h-12 rounded-2xl border-border/80 bg-background/80", state.fieldErrors?.email && "border-destructive")}
          name="email"
          placeholder="Work email"
          required
          type="email"
        />
        <LeadMagnetButton />
      </div>

      <p className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
        {state.message || "Enter a work email to request the brief and review the framework internally."}
      </p>
    </form>
  );
}
