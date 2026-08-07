"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { quickCaptureWisdomAction } from "@/app/library/wisdom/actions";
import { Button } from "@/components/ui/button";
import { wisdomSourceTypes } from "@/lib/wisdom-options";

export function WisdomQuickCapture() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [state, formAction, pending] = useActionState(
    quickCaptureWisdomAction,
    { ok: true, error: "" }
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (hasSubmitted && state.ok && !pending) {
      setOpen(false);
      setHasSubmitted(false);
    }
  }, [hasSubmitted, pending, state.ok]);

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
      {mounted && open
        ? createPortal(
        <div
          aria-modal="true"
          className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md"
          role="dialog"
        >
          <form
            action={formAction}
            className="my-8 w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-emerald-200/20 bg-slate-950 text-white shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
            onSubmit={() => setHasSubmitted(true)}
          >
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(16,185,129,0.20),transparent_34%),radial-gradient(circle_at_95%_10%,rgba(245,158,11,0.12),transparent_28%)] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                    Capture Wisdom
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Save the nugget.
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">
                    One field is enough. It lands in the Wisdom Inbox so you can
                    decide what it means later.
                  </p>
                </div>
                <button
                  aria-label="Close wisdom capture"
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/15"
                  onClick={() => {
                    setHasSubmitted(false);
                    setOpen(false);
                  }}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-5 sm:p-6">
              <label className="grid gap-2 text-sm font-medium">
                Idea / nugget
                <textarea
                  className="min-h-36 rounded-2xl border border-white/15 bg-slate-900/90 px-4 py-3 text-sm leading-6 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                  name="idea"
                  placeholder="What is worth remembering?"
                  required
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Source type
                  <select
                    className="h-11 rounded-xl border border-white/15 bg-slate-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
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
                    className="h-11 rounded-xl border border-white/15 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                    name="sourceName"
                    placeholder="Book, podcast, person"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium">
                Photo/reference URL
                <input
                  className="h-11 rounded-xl border border-white/15 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                  name="photoUrl"
                  placeholder="Optional image URL or file reference"
                />
              </label>

              {!state.ok && (
                <p className="text-sm text-red-300">{state.error}</p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  className="rounded-xl"
                  disabled={pending}
                  onClick={() => {
                    setHasSubmitted(false);
                    setOpen(false);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button className="rounded-xl" disabled={pending} type="submit">
                  Save to Inbox
                </Button>
              </div>
            </div>
          </form>
        </div>,
          document.body
        )
        : null}
    </>
  );
}
