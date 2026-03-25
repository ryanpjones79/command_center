import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshWatchlist } from "@/server/market-data-service";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await refreshWatchlist(session.user.id);
  return NextResponse.json({ ok: true, results });
}
