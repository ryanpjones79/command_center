import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS,
  MAX_AGENT_CRON_REQUEST_TIMEOUT_MS,
  MIN_AGENT_CRON_REQUEST_TIMEOUT_MS,
  boundedAgentCronRequestTimeoutMs,
  main
} from "@/scripts/run-railway-cron.mjs";

type EndpointResponse = { status: number; body: string; disconnect?: boolean };
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
});

async function runCron(
  responses: Record<string, EndpointResponse>,
  dailyBriefEnabled: boolean,
  environment: Record<string, string> = {}
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
      FEATURE_DAILY_BRIEF_AUTOSEND: dailyBriefEnabled ? "true" : "false",
      ...environment
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

function delayedFetch(delayMs: number, response: Response) {
  return vi.fn((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(response), delayMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(
          Object.assign(new Error("This operation was aborted"), {
            name: "AbortError"
          })
        );
      });
    })
  );
}

describe("Railway agent cron reliability", () => {
  it("allows a 61-second agent response under the five-minute default", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      delayedFetch(
        61_000,
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )
    );

    const result = main({
      CRON_TARGET_URL: "https://cron.test",
      CRON_SECRET: "test-secret",
      FEATURE_DAILY_BRIEF_AUTOSEND: "false"
    });
    await vi.advanceTimersByTimeAsync(61_001);

    await expect(result).resolves.toBe(0);
  });

  it("uses a configurable timeout and bounds it to one through ten minutes", async () => {
    expect(boundedAgentCronRequestTimeoutMs(undefined)).toBe(
      DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS
    );
    expect(boundedAgentCronRequestTimeoutMs("120000")).toBe(120_000);
    expect(boundedAgentCronRequestTimeoutMs("1")).toBe(
      MIN_AGENT_CRON_REQUEST_TIMEOUT_MS
    );
    expect(boundedAgentCronRequestTimeoutMs("9999999")).toBe(
      MAX_AGENT_CRON_REQUEST_TIMEOUT_MS
    );
    expect(boundedAgentCronRequestTimeoutMs("not-a-number")).toBe(
      DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS
    );

    const configured = await runCron(
      {
        "/api/cron/agents": {
          status: 200,
          body: JSON.stringify({ ok: true })
        }
      },
      false,
      { AGENT_CRON_REQUEST_TIMEOUT_MS: "120000" }
    );
    expect(configured.output).toMatch(/AGENTS START .*timeoutMs=120000/);
  });

  it("returns failure and an explicit timeout reason when the bound expires", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      delayedFetch(
        DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS + 1,
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = main({
      CRON_TARGET_URL: "https://cron.test",
      CRON_SECRET: "test-secret",
      FEATURE_DAILY_BRIEF_AUTOSEND: "false"
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS);

    await expect(result).resolves.toBe(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringMatching(
        /AGENTS FAILURE reason=TIMEOUT timeoutMs=300000/
      )
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringMatching(/CRON COMPLETE status=FAILURE critical=AGENTS/)
    );
  });

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
    expect(result.output).toMatch(/DAILY BRIEF FAILURE reason=NETWORK error=/);
    expect(result.output).toMatch(/AGENTS START .*timeoutMs=300000/);
    expect(result.output).toMatch(/DAILY BRIEF START .*timeoutMs=60000/);
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
    expect(result.output).toMatch(/AGENTS FAILURE reason=HTTP status=500/);
    expect(result.output).toMatch(/CRON COMPLETE status=FAILURE critical=AGENTS/);
    expect(result.output.indexOf("AGENTS START")).toBeLessThan(
      result.output.indexOf("DAILY BRIEF START")
    );
  });
});
