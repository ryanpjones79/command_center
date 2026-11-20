import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Serves a captured photo to its owner only. Never cached publicly.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const file = await prisma.captureAttachment.findFirst({
    where: { id: String(id).slice(0, 64), userId: session.user.id },
    select: { data: true, mimeType: true }
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(file.data), {
    headers: { "Content-Type": file.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  });
}
