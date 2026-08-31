import process from "node:process";
import { pathToFileURL } from "node:url";

export const DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS = 300_000;
export const MIN_AGENT_CRON_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_AGENT_CRON_REQUEST_TIMEOUT_MS = 600_000;
const DAILY_BRIEF_REQUEST_TIMEOUT_MS = 60_000;

const timestamp = () => new Date().toISOString();
const log = (message) => console.log(`[railway-cron] ${timestamp()} ${message}`);
const logError = (message) =>
  console.error(`[railway-cron] ${timestamp()} ${message}`);

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

export function boundedAgentCronRequestTimeoutMs(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS;
  return Math.min(
    MAX_AGENT_CRON_REQUEST_TIMEOUT_MS,
    Math.max(MIN_AGENT_CRON_REQUEST_TIMEOUT_MS, Math.floor(parsed))
  );
}

export async function invokeEndpoint(
  baseUrl,
  secret,
  operation,
  path,
  timeoutMs
) {
  const endpoint = new URL(path, ensureTrailingSlash(baseUrl));
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  log(`${operation} START target=${endpoint.toString()} timeoutMs=${timeoutMs}`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${secret}`,
        accept: "application/json"
      },
      signal: controller.signal
    });
    const body = await response.text();
    const result = body ? ` result=${body.slice(0, 4000)}` : "";
    if (!response.ok) {
      logError(
        `${operation} FAILURE reason=HTTP status=${response.status}${result}`
      );
      return {
        ok: false,
        failureReason: "HTTP",
        status: response.status,
        body
      };
    }
    const skipped =
      operation === "DAILY BRIEF" && /\"skipped\"\s*:/.test(body);
    log(
      `${operation} ${skipped ? "SKIPPED" : "SUCCESS"} status=${response.status}${result}`
    );
    return { ok: true, skipped, status: response.status, body };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unknown cron request failure.";
    if (timedOut) {
      logError(`${operation} FAILURE reason=TIMEOUT timeoutMs=${timeoutMs}`);
      return {
        ok: false,
        failureReason: "TIMEOUT",
        status: null,
        body: ""
      };
    }
    logError(`${operation} FAILURE reason=NETWORK error=${detail}`);
    return {
      ok: false,
      failureReason: "NETWORK",
      status: null,
      body: ""
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function main(environment = process.env) {
  log("CRON START");
  const baseUrl = environment.CRON_TARGET_URL || environment.NEXTAUTH_URL;
  const secret = environment.CRON_SECRET;
  const agentTimeoutMs = boundedAgentCronRequestTimeoutMs(
    environment.AGENT_CRON_REQUEST_TIMEOUT_MS
  );

  if (!baseUrl || !secret) {
    logError(
      `AGENTS FAILURE error=${
        !baseUrl
          ? "Missing CRON_TARGET_URL or NEXTAUTH_URL."
          : "Missing CRON_SECRET."
      }`
    );
    logError("CRON COMPLETE status=FAILURE");
    return 1;
  }

  const agents = await invokeEndpoint(
    baseUrl,
    secret,
    "AGENTS",
    "/api/cron/agents",
    agentTimeoutMs
  );

  if (environment.FEATURE_DAILY_BRIEF_AUTOSEND !== "true") {
    log(
      "DAILY BRIEF SKIPPED reason=FEATURE_DAILY_BRIEF_AUTOSEND is not true"
    );
  } else {
    await invokeEndpoint(
      baseUrl,
      secret,
      "DAILY BRIEF",
      "/api/cron/daily-brief",
      DAILY_BRIEF_REQUEST_TIMEOUT_MS
    );
  }

  if (!agents.ok) {
    logError("CRON COMPLETE status=FAILURE critical=AGENTS");
    return 1;
  }
  log("CRON COMPLETE status=SUCCESS");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main();
}
