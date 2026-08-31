import process from "node:process";

const timestamp = () => new Date().toISOString();
const log = (message) => console.log(`[railway-cron] ${timestamp()} ${message}`);
const logError = (message) =>
  console.error(`[railway-cron] ${timestamp()} ${message}`);

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function invokeEndpoint(baseUrl, secret, operation, path) {
  const endpoint = new URL(path, ensureTrailingSlash(baseUrl));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  log(`${operation} START target=${endpoint.toString()}`);

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
      logError(`${operation} FAILURE status=${response.status}${result}`);
      return { ok: false, status: response.status, body };
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
    logError(`${operation} FAILURE error=${detail}`);
    return { ok: false, status: null, body: "" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  log("CRON START");
  const baseUrl = process.env.CRON_TARGET_URL || process.env.NEXTAUTH_URL;
  const secret = process.env.CRON_SECRET;

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
    "/api/cron/agents"
  );

  if (process.env.FEATURE_DAILY_BRIEF_AUTOSEND !== "true") {
    log(
      "DAILY BRIEF SKIPPED reason=FEATURE_DAILY_BRIEF_AUTOSEND is not true"
    );
  } else {
    await invokeEndpoint(
      baseUrl,
      secret,
      "DAILY BRIEF",
      "/api/cron/daily-brief"
    );
  }

  if (!agents.ok) {
    logError("CRON COMPLETE status=FAILURE critical=AGENTS");
    return 1;
  }
  log("CRON COMPLETE status=SUCCESS");
  return 0;
}

process.exitCode = await main();
