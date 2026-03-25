import { google } from "googleapis";

export type GoogleConfigSnapshot = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
  spreadsheetId: string;
  sheetName: string;
  dailyBriefEmailTo: string;
  calendarEnabled: boolean;
  gmailEnabled: boolean;
};

const requiredGoogleKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_SHEETS_SHEET_NAME"
] as const;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getGoogleConfigSnapshot(): GoogleConfigSnapshot {
  return {
    clientId: readEnv("GOOGLE_CLIENT_ID"),
    clientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
    refreshToken: readEnv("GOOGLE_REFRESH_TOKEN"),
    calendarId: readEnv("GOOGLE_CALENDAR_ID") || "primary",
    spreadsheetId: readEnv("GOOGLE_SHEETS_SPREADSHEET_ID"),
    sheetName: readEnv("GOOGLE_SHEETS_SHEET_NAME"),
    dailyBriefEmailTo: readEnv("GOOGLE_DAILY_BRIEF_EMAIL_TO"),
    calendarEnabled: readEnv("FEATURE_GOOGLE_CALENDAR") === "true",
    gmailEnabled: readEnv("FEATURE_GMAIL_TRIAGE") === "true"
  };
}

export function getMissingGoogleConfigKeys() {
  const snapshot = getGoogleConfigSnapshot();

  return requiredGoogleKeys.filter((key) => {
    switch (key) {
      case "GOOGLE_CLIENT_ID":
        return !snapshot.clientId;
      case "GOOGLE_CLIENT_SECRET":
        return !snapshot.clientSecret;
      case "GOOGLE_REFRESH_TOKEN":
        return !snapshot.refreshToken;
      case "GOOGLE_SHEETS_SPREADSHEET_ID":
        return !snapshot.spreadsheetId;
      case "GOOGLE_SHEETS_SHEET_NAME":
        return !snapshot.sheetName;
      default:
        return false;
    }
  });
}

function assertGoogleConfigured() {
  const missing = getMissingGoogleConfigKeys();
  if (missing.length > 0) {
    throw new Error(`Missing Google configuration: ${missing.join(", ")}`);
  }
}

export function getGoogleOAuthClient() {
  const snapshot = getGoogleConfigSnapshot();
  assertGoogleConfigured();

  const auth = new google.auth.OAuth2(snapshot.clientId, snapshot.clientSecret);
  auth.setCredentials({ refresh_token: snapshot.refreshToken });
  return auth;
}

export function getGoogleCalendarClient() {
  return google.calendar({ version: "v3", auth: getGoogleOAuthClient() });
}

export function getGoogleSheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleOAuthClient() });
}

export function getGoogleGmailClient() {
  return google.gmail({ version: "v1", auth: getGoogleOAuthClient() });
}
