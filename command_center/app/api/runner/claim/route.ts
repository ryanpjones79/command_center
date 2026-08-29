import { z } from "zod";
import { claimRunnerWork } from "@/server/agent/runner-service";
import { withAuthenticatedRunner } from "@/server/agent/runner-route";

const schema = z.object({ capabilities: z.array(z.string()).min(1).max(20), version: z.string().min(1).max(100) });
export async function POST(request: Request) { return withAuthenticatedRunner(request, schema, claimRunnerWork); }
