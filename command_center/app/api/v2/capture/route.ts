import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { captureTokenValid, resolveOwnerUserId } from "@/server/v2/inbound-auth";
import { createCapture } from "@/server/v2/capture";

// Phone Shortcut / share capture: POST { text } with Bearer RYANOS_CAPTURE_TOKEN.
// Returns the same honest receipt as the app (or the error, so the Shortcut
// can say it wasn't saved).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!captureTokenValid(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let text = "";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    text = contentType.includes("application/json") ? String((await request.json())?.text ?? "") : await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the capture." }, { status: 400 });
  }
  const userId = await resolveOwnerUserId(prisma);
  if (!userId) return NextResponse.json({ ok: false, error: "Owner not configured" }, { status: 503 });
  const receipt = await createCapture(userId, { text: text.slice(0, 20_000), kind: "SHARE" }, prisma);
  return NextResponse.json(receipt, { status: receipt.ok ? 200 : 422 });
}
