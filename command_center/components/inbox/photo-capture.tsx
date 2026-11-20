"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { capturePhotoAction, undoCaptureAction } from "@/app/inbox/capture-actions";

// Capture → Photo → Save. On phones the file input opens the camera.
export function PhotoCapture() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ ids: string[]; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await capturePhotoAction(formData);
          if (result.ok) {
            setReceipt({ ids: result.taskIds, label: result.reviewLabel });
            setError(null);
            setPreview(null);
            formRef.current?.reset();
            router.refresh();
          } else {
            setError(result.error);
          }
        })
      }
      className="space-y-4"
      ref={formRef}
    >
      <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card p-6 text-center focus-within:ring-2 focus-within:ring-ring">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Selected capture" className="max-h-72 rounded-xl object-contain" src={preview} />
        ) : (
          <>
            <Camera aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
            <span className="text-base font-semibold">Take or choose a photo</span>
            <span className="text-sm text-muted-foreground">Paper forms, flyers, receipts, screenshots</span>
          </>
        )}
        <input
          accept="image/*"
          capture="environment"
          className="sr-only"
          name="photo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
            setError(null);
          }}
          type="file"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          What is it? <span className="font-normal text-muted-foreground">(optional)</span>
          <input className="mt-1 h-12 w-full rounded-xl border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="text" placeholder="e.g. Return field-trip permission slip" />
        </label>
        <label className="text-sm font-medium">
          Where is the paper? <span className="font-normal text-muted-foreground">(optional)</span>
          <input className="mt-1 h-12 w-full rounded-xl border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" name="location" placeholder="e.g. Kitchen counter folder" />
        </label>
      </div>

      <button className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:w-auto sm:px-8" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save"}
      </button>

      <div aria-live="polite" className="text-sm">
        {receipt && (
          <p className="text-muted-foreground">
            Saved with the original photo. Back for a decision {receipt.label}.{" "}
            <button
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => startTransition(async () => { await undoCaptureAction(receipt.ids); setReceipt(null); router.refresh(); })}
              type="button"
            >
              Undo
            </button>
          </p>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </div>
    </form>
  );
}
