"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitLeadAction } from "@/app/contact/actions";
import { initialLeadFormState } from "@/lib/marketing/lead";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_16px_36px_rgba(16,185,129,0.22)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting..." : label}
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

export function ContactForm() {
  const [state, action] = useActionState(submitLeadAction, initialLeadFormState);

  return (
    <form action={action} className="grid gap-5">
      <input name="source" type="hidden" value="contact-page" />

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
          <Input className="h-12 rounded-2xl border-border/80 bg-background/80" name="company" placeholder="Brand or business name" />
        </Field>
        <Field error={state.fieldErrors?.businessType?.[0]} label="Business type">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="businessType">
            <option value="">Select one</option>
            <option value="consumer-brand">Consumer brand</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="shopify-brand">Shopify or DTC brand</option>
            <option value="omnichannel-brand-team">Ecommerce or omnichannel brand team</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.revenueBand?.[0]} label="Amazon stage">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="revenueBand">
            <option value="">Select one</option>
            <option value="not-on-amazon">Not yet on Amazon</option>
            <option value="early-amazon">Early Amazon presence</option>
            <option value="active-under-managed">Active on Amazon but under-managed</option>
            <option value="marketplace-disorder">Too many third-party sellers or pricing issues</option>
          </select>
        </Field>
        <Field error={state.fieldErrors?.timeline?.[0]} label="Timeline">
          <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="timeline">
            <option value="">Select one</option>
            <option value="now">Need help now</option>
            <option value="30-days">Within 30 days</option>
            <option value="quarter">This quarter</option>
            <option value="exploring">Exploring options</option>
          </select>
        </Field>
      </div>

      <Field error={state.fieldErrors?.primaryGoal?.[0]} label="Primary goal">
        <select className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground" name="primaryGoal">
          <option value="">Select one</option>
          <option value="launch-support">Launch support</option>
          <option value="channel-cleanup">Channel cleanup and control</option>
          <option value="listings-and-content">Listings and content improvement</option>
          <option value="advertising-management">Advertising management</option>
          <option value="ongoing-channel-management">Ongoing Amazon management</option>
        </select>
      </Field>

      <Field error={state.fieldErrors?.message?.[0]} label="What should the strategy call focus on?">
        <Textarea
          className={cn("min-h-[150px] rounded-[1.5rem] border-border/80 bg-background/80", state.fieldErrors?.message && "border-destructive")}
          name="message"
          placeholder="Share whether the need is launch, cleanup, listings, advertising, or ongoing management."
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-sm", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
          {state.message || "Share enough context so the first conversation can focus on the right priorities quickly."}
        </p>
        <SubmitButton label="Book Strategy Call" />
      </div>
    </form>
  );
}
