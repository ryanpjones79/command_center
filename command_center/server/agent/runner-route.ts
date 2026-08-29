import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRunnerRequest } from "@/server/agent/runner-auth";

export async function withAuthenticatedRunner<T>(request: Request, schema: z.ZodType<T>, handler: (runner: Awaited<ReturnType<typeof authenticateRunnerRequest>>, input: T) => Promise<unknown>) {
  const raw = await request.text();
  try {
    const runner = await authenticateRunnerRequest(request, raw);
    const input = schema.parse(raw ? JSON.parse(raw) : {});
    return NextResponse.json({ ok: true, data: await handler(runner, input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runner request failed.";
    const status = /authentication|signature|replay|timestamp|registered|key/i.test(message) ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
