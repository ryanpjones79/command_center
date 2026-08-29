import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAgentOrchestrationCycle } from "@/server/agent/orchestration-service";
import { ensureInitialAgentProjects } from "@/server/agent/setup-service";
import { scheduleSignalCareQualificationReviewOnce } from "@/server/agent/signalcare-research-service";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return unauthorized();
  }
  if (process.env.FEATURE_AGENT_ORCHESTRATION !== "true") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    await ensureInitialAgentProjects(user.id);
    await scheduleSignalCareQualificationReviewOnce(user.id);
  }
  const result = await runAgentOrchestrationCycle(new Date());
  return NextResponse.json({ ok: true, result });
}
