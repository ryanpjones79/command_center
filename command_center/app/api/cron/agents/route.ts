import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAgentOrchestrationCycle } from "@/server/agent/orchestration-service";
import { ensureInitialAgentProjects } from "@/server/agent/setup-service";
import {
  recoverPrematureSignalCareOutreachDecisions,
  recoverSignalCareOwnerPassContinuation,
  scheduleSignalCareQualificationReviewOnce
} from "@/server/agent/signalcare-research-service";
import {
  recordAgentSchedulerFailure,
  recordAgentSchedulerStart,
  recordAgentSchedulerSuccess
} from "@/server/agent/scheduler-heartbeat";

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

  const startedAt = new Date();
  await recordAgentSchedulerStart(startedAt).catch((error) => {
    console.error("[agent-cron] Failed to record cycle start.", error);
  });
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      await ensureInitialAgentProjects(user.id);
      await recoverPrematureSignalCareOutreachDecisions(user.id);
      await recoverSignalCareOwnerPassContinuation(user.id);
      await scheduleSignalCareQualificationReviewOnce(user.id);
    }
    const result = await runAgentOrchestrationCycle(startedAt);
    await recordAgentSchedulerSuccess(result);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const failedAt = new Date();
    await recordAgentSchedulerFailure(startedAt, failedAt, error).catch(
      (heartbeatError) => {
        console.error(
          "[agent-cron] Failed to record cycle failure.",
          heartbeatError
        );
      }
    );
    console.error("[agent-cron] Agent orchestration cycle failed.", error);
    return NextResponse.json(
      { ok: false, error: "Agent orchestration cycle failed." },
      { status: 500 }
    );
  }
}
