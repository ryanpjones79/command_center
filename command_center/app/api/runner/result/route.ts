import { z } from "zod";
import { submitRunnerResult } from "@/server/agent/runner-service";
import { withAuthenticatedRunner } from "@/server/agent/runner-route";
const schema = z.object({ workItemId: z.string().cuid(), claimToken: z.string().uuid(), result: z.unknown() });
export async function POST(request: Request) { return withAuthenticatedRunner(request, schema, (runner, input) => submitRunnerResult(runner, input.workItemId, input.claimToken, input.result)); }
