import { z } from "zod";
import { submitRunnerResult } from "@/server/agent/runner-service";
import { withAuthenticatedRunner } from "@/server/agent/runner-route";
const schema = z.object({ workItemId: z.string().cuid(), claimToken: z.string().uuid(), error: z.string().min(1).max(8000), evidence: z.string().max(30000).default("") });
export async function POST(request: Request) { return withAuthenticatedRunner(request, schema, (runner, input) => submitRunnerResult(runner, input.workItemId, input.claimToken, { status: "FAILED", summary: input.error, filesChanged: [], testsRun: [], testResults: "", unresolvedIssues: [input.error], evidence: input.evidence, acceptanceCriteriaSatisfied: false, recommendedQaAction: "REPAIR" })); }
