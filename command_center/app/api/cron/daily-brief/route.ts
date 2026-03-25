import { NextResponse } from "next/server";
import { runDailyBriefAutosend } from "@/server/daily-brief-autosend";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return unauthorized();
    }
  }

  const result = await runDailyBriefAutosend(new Date());
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
