"use client";

import { useActionState, useEffect, useState } from "react";
import { quickCaptureWisdomAction } from "@/app/library/wisdom/actions";
import { Button } from "@/components/ui/button";
import { wisdomSourceTypes } from "@/lib/wisdom-options";

export function WisdomQuickCapture() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    quickCaptureWisdomAction,
    { ok: true, error: "" }
  );

  useEffect(() => {
    if (state.ok && !pending) {
      setOpen(false);
    }
  }, [pending, state.ok]);

  return (
    <>
      <Button
        className="h-9 shrink-0 px-3 text-xs sm:text-sm"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        + Wisdom
      </Button>
      {open && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-end bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
          role="dialog"
        >
          <form
            action={formAction}
            className="w-full max-w-lg rounded-[1.5rem] border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Capture Wisdom
                </p>
                <h2 className="mt-1 text-2xl font-semibold">Inbox capture</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Capture quickly now. Decide what it means later.
                </p>
              </div>
              <button
                aria-label="Close wisdom capture"
                className="rounded-full border px-3 py-1 text-sm"
                onClick={() => setOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <label className="mt-5 grid gap-2 text-sm font-medium">
              Idea / nugget
              <textarea
                className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                name="idea"
                placeholder="What is worth remembering?"
                required
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Source type
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue="other"
                  name="sourceType"
                >
                  {wisdomSourceTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Source
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  name="sourceName"
                  placeholder="Book, podcast, person"
                />
              </label>
            </div>

            <label className="mt-4 grid gap-2 text-sm font-medium">
              Photo/reference URL
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                name="photoUrl"
                placeholder="Optional image URL or file reference"
              />
            </label>

            {!state.ok && (
              <p className="mt-3 text-sm text-destructive">{state.error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                Save to Inbox
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
