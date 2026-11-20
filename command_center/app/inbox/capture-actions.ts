"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createCapture, MAX_PHOTO_BYTES, undoCapture, type CaptureReceipt } from "@/server/v2/capture";

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/now");
  revalidatePath("/time-blocks");
}

export async function captureTextAction(text: string): Promise<CaptureReceipt> {
  const user = await requireUser();
  try {
    const receipt = await createCapture(user.id, { text: String(text ?? "").slice(0, 20_000), kind: "TEXT" }, prisma);
    if (receipt.ok) refresh();
    return receipt;
  } catch {
    return { ok: false, error: "Not saved. RyanOS couldn't reach its database; your text is still in the box." };
  }
}

export async function capturePhotoAction(formData: FormData): Promise<CaptureReceipt> {
  const user = await requireUser();
  const file = formData.get("photo");
  const text = String(formData.get("text") ?? "").slice(0, 2000);
  const locationNote = String(formData.get("location") ?? "").slice(0, 200) || null;
  if (!(file instanceof File) || file.size === 0) {
    return text.trim() ? captureTextAction(text) : { ok: false, error: "Take or choose a photo first." };
  }
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is over 8 MB. Try a smaller one." };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const receipt = await createCapture(user.id, { text, locationNote, photo: { mimeType: file.type || "image/jpeg", bytes }, kind: "PHOTO" }, prisma);
    if (receipt.ok) refresh();
    return receipt;
  } catch {
    return { ok: false, error: "Not saved. The upload didn't reach RyanOS; try again." };
  }
}

export async function undoCaptureAction(taskIds: string[]) {
  const user = await requireUser();
  const result = await undoCapture(user.id, Array.isArray(taskIds) ? taskIds.map(String) : [], prisma);
  if (result.ok) refresh();
  return result;
}
