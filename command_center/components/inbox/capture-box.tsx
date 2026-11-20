"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { captureTextAction, undoCaptureAction } from "@/app/inbox/capture-actions";

// One sentence and Save. Enter saves; Shift+Enter or a paste allows many lines
// (each line becomes its own item). The receipt says when it comes back and
// offers Undo; a failed save says so and keeps the text.
export function CaptureBox({ autoFocus = false, compact = false, initialText = "" }: { autoFocus?: boolean; compact?: boolean; initialText?: string }) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [receipt, setReceipt] = useState<{ ids: string[]; label: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = text.split("\n").filter((line) => line.trim()).length;
  const id = compact ? "capture-compact" : "capture-full";

  function save() {
    if (!text.trim() || pending) return;
    startTransition(async () => {
      const result = await captureTextAction(text);
      if (result.ok) {
        setReceipt({ ids: result.taskIds, label: result.reviewLabel, count: result.count });
        setError(null);
        setText("");
        router.refresh();
        ref.current?.focus();
      } else {
        setError(result.error);
        setReceipt(null);
      }
    });
  }

  function undo() {
    if (!receipt) return;
    const ids = receipt.ids;
    startTransition(async () => {
      const result = await undoCaptureAction(ids);
      setReceipt(null);
      setError(result.ok ? null : "Too late to undo; sort it in the Inbox instead.");
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="sr-only" htmlFor={id}>Capture</label>
      <div className="flex gap-2">
        <textarea
          autoFocus={autoFocus}
          className="min-h-12 flex-1 resize-y rounded-xl border bg-background px-3.5 py-3 text-base leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={id}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              save();
            }
          }}
          placeholder={compact ? "Capture a thought or to-do…" : "One sentence is enough. Paste a list to capture each line."}
          ref={ref}
          rows={compact ? 1 : 3}
          value={text}
        />
        <button
          className="h-12 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          disabled={pending || !text.trim()}
          type="submit"
        >
          {pending ? "Saving…" : lines > 1 ? `Save ${lines}` : "Save"}
        </button>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">
        {receipt && (
          <p className="text-muted-foreground">
            Saved{receipt.count > 1 ? ` ${receipt.count} items` : ""}. Back for a decision {receipt.label}.{" "}
            <button className="font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={undo} type="button">
              Undo
            </button>
          </p>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </div>
    </form>
  );
}
