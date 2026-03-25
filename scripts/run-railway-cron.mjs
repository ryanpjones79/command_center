import process from "node:process";

const baseUrl = process.env.CRON_TARGET_URL || process.env.NEXTAUTH_URL;
const secret = process.env.CRON_SECRET;

if (!baseUrl) {
  console.error("Missing CRON_TARGET_URL or NEXTAUTH_URL for Railway cron trigger.");
  process.exit(1);
}

if (!secret) {
  console.error("Missing CRON_SECRET for Railway cron trigger.");
  process.exit(1);
}

const endpoint = new URL("/api/cron/daily-brief", ensureTrailingSlash(baseUrl));
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 60_000);

console.log(`[railway-cron] Triggering ${endpoint.toString()}`);

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
  if (body) {
    console.log(body);
  }

  if (!response.ok) {
    console.error(`[railway-cron] Request failed with status ${response.status}.`);
    process.exit(1);
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(`[railway-cron] ${error.message}`);
  } else {
    console.error("[railway-cron] Unknown cron failure.");
  }
  process.exit(1);
} finally {
  clearTimeout(timeoutId);
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
