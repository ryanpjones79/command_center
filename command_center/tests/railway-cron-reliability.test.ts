import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type EndpointResponse = { status: number; body: string; disconnect?: boolean };
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
});

async function runCron(
  responses: Record<string, EndpointResponse>,
  dailyBriefEnabled: boolean
) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const requestPath = request.url ?? "";
    requests.push(requestPath);
    const configured = responses[requestPath] ?? {
      status: 404,
      body: JSON.stringify({ ok: false })
    };
    if (configured.disconnect) {
      request.socket.destroy();
      return;
    }
    response.statusCode = configured.status;
    response.setHeader("content-type", "application/json");
    response.end(configured.body);
  });
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port.");

  const script = path.join(process.cwd(), "scripts", "run-railway-cron.mjs");
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CRON_TARGET_URL: `http://127.0.0.1:${address.port}`,
      CRON_SECRET: "cron-test-secret",
      FEATURE_DAILY_BRIEF_AUTOSEND: dailyBriefEnabled ? "true" : "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  return { exitCode, output: `${stdout}${stderr}`, requests };
}

describe("Railway agent cron reliability", () => {
  it("runs agents first and skips a disabled daily brief", async () => {
    const result = await runCron(
      {
        "/api/cron/agents": {
          status: 200,
          body: JSON.stringify({ ok: true, result: { dueProjectCount: 2 } })
        }
      },
      false
    );

    expect(result.exitCode).toBe(0);
    expect(result.requests).toEqual(["/api/cron/agents"]);
    expect(result.output).toMatch(
      /\[railway-cron\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z CRON START/
    );
    expect(result.output).toMatch(/AGENTS START/);
    expect(result.output).toMatch(/AGENTS SUCCESS/);
    expect(result.output).toMatch(/DAILY BRIEF SKIPPED/);
    expect(result.output).toMatch(/CRON COMPLETE status=SUCCESS/);
    expect(result.output.indexOf("AGENTS SUCCESS")).toBeLessThan(
      result.output.indexOf("DAILY BRIEF SKIPPED")
    );
    expect(result.output).not.toContain("cron-test-secret");
  });

  it("reports a daily-brief failure without invalidating agent success", async () => {
    const result = await runCron(
      {
        "/api/cron/agents": {
          status: 200,
          body: JSON.stringify({ ok: true, result: { dueProjectCount: 2 } })
        },
        "/api/cron/daily-brief": { status: 500, body: "", disconnect: true }
      },
      true
    );

    expect(result.exitCode).toBe(0);
    expect(result.requests).toEqual([
      "/api/cron/agents",
      "/api/cron/daily-brief"
    ]);
    expect(result.output).toMatch(/AGENTS SUCCESS/);
    expect(result.output).toMatch(/DAILY BRIEF FAILURE error=/);
    expect(result.output).toMatch(/CRON COMPLETE status=SUCCESS/);
  });

  it("surfaces critical agent failure after independently reporting optional work", async () => {
    const result = await runCron(
      {
        "/api/cron/agents": {
          status: 500,
          body: JSON.stringify({ ok: false, error: "Agent cycle failed" })
        },
        "/api/cron/daily-brief": {
          status: 200,
          body: JSON.stringify({ ok: true })
        }
      },
      true
    );

    expect(result.exitCode).toBe(1);
    expect(result.requests).toEqual([
      "/api/cron/agents",
      "/api/cron/daily-brief"
    ]);
    expect(result.output).toMatch(/AGENTS FAILURE status=500/);
    expect(result.output).toMatch(/CRON COMPLETE status=FAILURE critical=AGENTS/);
    expect(result.output.indexOf("AGENTS START")).toBeLessThan(
      result.output.indexOf("DAILY BRIEF START")
    );
  });
});
