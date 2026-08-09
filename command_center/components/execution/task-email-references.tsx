import {
  addExecutionTaskReferenceAction,
  deleteExecutionTaskReferenceAction
} from "@/app/execution-actions";
import { SubmitButton } from "@/components/execution/submit-button";

export type TaskEmailReference = {
  id: string;
  provider: string;
  title: string;
  url: string | null;
  note: string | null;
  createdAt?: Date;
};

const providerLabels: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  other: "Email"
};

const inputClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

function displayProvider(value: string) {
  return providerLabels[value] ?? "Email";
}

function isOpenableReference(value: string | null) {
  if (!value) return false;
  return /^(https?:\/\/|mailto:|outlook:)/i.test(value.trim());
}

export function TaskEmailReferenceList({
  references,
  tone = "default"
}: {
  references: TaskEmailReference[];
  tone?: "default" | "glass";
}) {
  if (references.length === 0) {
    return <p className="text-sm text-muted-foreground">No email references attached.</p>;
  }

  const cardClass =
    tone === "glass"
      ? "rounded-xl border border-white/10 bg-white/[0.06] p-3"
      : "rounded-xl border border-border/70 bg-background/60 p-3";

  return (
    <div className="grid gap-2">
      {references.map((reference) => {
        const hasLink = isOpenableReference(reference.url);
        return (
          <div className={cardClass} key={reference.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {displayProvider(reference.provider)}
                </p>
                <p className="mt-1 break-words text-sm font-medium">{reference.title}</p>
              </div>
              {hasLink && (
                <a
                  className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                  href={reference.url ?? ""}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
              )}
            </div>
            {reference.note && <p className="mt-2 text-xs text-muted-foreground">{reference.note}</p>}
            {reference.url && !hasLink && (
              <p className="mt-2 break-words text-xs text-muted-foreground">{reference.url}</p>
            )}
            <form action={deleteExecutionTaskReferenceAction} className="mt-2">
              <input name="referenceId" type="hidden" value={reference.id} />
              <SubmitButton
                className="h-7 rounded-md border border-border px-2 text-xs text-muted-foreground disabled:opacity-60"
                pendingLabel="Removing..."
                type="submit"
              >
                Remove
              </SubmitButton>
            </form>
          </div>
        );
      })}
    </div>
  );
}

export function TaskEmailReferenceForm({ taskId }: { taskId: string }) {
  return (
    <details className="rounded-xl border border-border/70 bg-background/45 p-3">
      <summary className="cursor-pointer text-sm font-medium">Attach email reference</summary>
      <form action={addExecutionTaskReferenceAction} className="mt-3 grid gap-3">
        <input name="taskId" type="hidden" value={taskId} />
        <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Source</span>
            <select className={inputClass} name="provider">
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook</option>
              <option value="other">Other email</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Subject / reference</span>
            <input className={inputClass} name="title" placeholder="Email subject or short description" required />
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Email link</span>
          <input className={inputClass} name="url" placeholder="Paste Gmail or Outlook message link" />
          <span className="text-[11px] leading-snug text-muted-foreground">
            Open the email, copy the browser URL, and paste it here. Keep PHI out of the title and notes.
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Why it matters</span>
          <textarea
            className="min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            name="note"
            placeholder="Optional: decision, context, or why this email supports the task"
          />
        </label>
        <SubmitButton className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-70 sm:w-fit" pendingLabel="Attaching..." type="submit">
          Attach Reference
        </SubmitButton>
      </form>
    </details>
  );
}
