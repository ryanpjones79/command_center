import { z } from "zod";
import { heartbeatRunnerWork } from "@/server/agent/runner-service";
import { withAuthenticatedRunner } from "@/server/agent/runner-route";
const schema = z.object({ workItemId: z.string().cuid(), claimToken: z.string().uuid() });
export async function POST(request: Request) { return withAuthenticatedRunner(request, schema, (runner, input) => heartbeatRunnerWork(runner, input.workItemId, input.claimToken)); }
