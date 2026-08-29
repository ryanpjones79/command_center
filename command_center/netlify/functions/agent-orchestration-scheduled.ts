import { runAgentOrchestrationCycle } from "../../server/agent/orchestration-service";
import { prisma } from "../../lib/prisma";
import { ensureInitialAgentProjects } from "../../server/agent/setup-service";

export const config = { schedule: "*/15 * * * *" };

export default async () => {
  if (process.env.FEATURE_AGENT_ORCHESTRATION === "false") {
    return new Response(JSON.stringify({ ok: true, disabled: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) await ensureInitialAgentProjects(user.id);
  const result = await runAgentOrchestrationCycle(new Date());
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};
