"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { captureIdeasAction } from "@/app/inbox/actions";

// Two-second capture. Enter saves; Shift+Enter (or a paste) allows many lines,
// and each line becomes its own idea.
export function CaptureBox({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = text.split("\n").filter((line) => line.trim()).length;

  function save() {
    if (!text.trim()) return;
    startTransition(async () => {
      const result = await captureIdeasAction(text);
      setMessage(result.message);
      if (result.ok) {
        setText("");
        router.refresh();
        ref.current?.focus();
      }
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
      <label className="sr-only" htmlFor={compact ? "capture-compact" : "capture-full"}>
        Capture an idea
      </label>
      <div className="flex gap-2">
        <textarea
          autoFocus={autoFocus}
          className="min-h-11 flex-1 resize-y rounded-2xl border bg-background px-3 py-2.5 text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={compact ? "capture-compact" : "capture-full"}
          onChange={(event) => {
            setText(event.target.value);
            setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              save();
            }
          }}
          placeholder={compact ? "Capture an idea or to-do…" : "Type an idea, or paste a whole Apple Notes list (one idea per line)"}
          ref={ref}
          rows={compact ? 1 : 3}
          value={text}
        />
        <button
          className="h-11 shrink-0 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          disabled={pending || !text.trim()}
          type="submit"
        >
          {pending ? "Saving…" : lines > 1 ? `Capture ${lines}` : "Capture"}
        </button>
      </div>
      {message && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </form>
  );
}
