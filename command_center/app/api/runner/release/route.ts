import { z } from "zod";
import { releaseRunnerWork } from "@/server/agent/runner-service";
import { withAuthenticatedRunner } from "@/server/agent/runner-route";
const schema = z.object({ workItemId: z.string().cuid(), claimToken: z.string().uuid(), reason: z.string().min(1).max(2000) });
export async function POST(request: Request) { return withAuthenticatedRunner(request, schema, (runner, input) => releaseRunnerWork(runner, input.workItemId, input.claimToken, input.reason)); }
