import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { google } from "googleapis";

const REQUIRED_ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/gmail.send"
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function quoteEnvValue(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function upsertEnvFile(envPath, updates) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const pendingKeys = new Set(Object.keys(updates));

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=.*$/);
    if (!match) {
      return line;
    }

    const key = match[1];
    if (!pendingKeys.has(key)) {
      return line;
    }

    pendingKeys.delete(key);
    return `${key}=${quoteEnvValue(updates[key])}`;
  });

  for (const key of pendingKeys) {
    nextLines.push(`${key}=${quoteEnvValue(updates[key])}`);
  }

  const output =
    `${nextLines.filter((line, index, source) => !(index === source.length - 1 && line === "")).join("\n")}\n`;
  fs.writeFileSync(envPath, output, "utf8");
}

const missingKeys = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
if (missingKeys.length > 0) {
  fail(`Missing required env vars: ${missingKeys.join(", ")}`);
}

const port = Number.parseInt(process.env.GOOGLE_OAUTH_REDIRECT_PORT ?? "3005", 10);
if (Number.isNaN(port) || port <= 0) {
  fail("GOOGLE_OAUTH_REDIRECT_PORT must be a valid positive integer.");
}

const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: true,
  scope: SCOPES
});

if (process.argv.includes("--print-url")) {
  console.log(authUrl);
  process.exit(0);
}

const envPath = path.resolve(process.cwd(), ".env");
let finished = false;

function finish(code) {
  if (finished) {
    return;
  }

  finished = true;
  process.exitCode = code;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", redirectUri);
    if (requestUrl.pathname !== "/oauth2callback") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    const authCode = requestUrl.searchParams.get("code");
    const authError = requestUrl.searchParams.get("error");

    if (authError) {
      throw new Error(`Google returned an authorization error: ${authError}`);
    }

    if (!authCode) {
      throw new Error("Missing authorization code in callback.");
    }

    const { tokens } = await oauth2Client.getToken(authCode);
    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token. Revoke the app grant and rerun the script.");
    }

    upsertEnvFile(envPath, {
      GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
      FEATURE_GOOGLE_CALENDAR: "true",
      FEATURE_GMAIL_TRIAGE: "true"
    });

    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Google authorization complete. You can close this tab and return to Codex.");

    console.log("Saved GOOGLE_REFRESH_TOKEN to .env");
    console.log("Enabled FEATURE_GOOGLE_CALENDAR and FEATURE_GMAIL_TRIAGE in .env");
    finish(0);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Google authorization failed. Check the terminal for details.");
    console.error(error instanceof Error ? error.message : String(error));
    finish(1);
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Listening for Google OAuth callback on ${redirectUri}`);
  console.log("Open this URL in your browser to authorize access:");
  console.log(authUrl);
});
