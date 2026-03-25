import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "daily-action-os",
    timestamp: new Date().toISOString()
  });
}
