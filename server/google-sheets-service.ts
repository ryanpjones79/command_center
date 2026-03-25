import { getGoogleConfigSnapshot, getGoogleSheetsClient } from "@/server/google-client";

export type DailyPlanningInputs = {
  date: string;
  workdayWindow: string;
  dayType: string;
  availableWorkBlocks: string[];
  bestDeepWorkBlock: string;
  topPriorities: string[];
  quickWins: string[];
  notes: string;
  energy: string;
  mustBeforeNoon: string;
  quickStartQueue: string[];
  morningLaunch: string[];
  outlookSweep: string;
  gratitude: string;
  relationshipConnection: string;
  raw: Record<string, string>;
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitList(value: string) {
  return value
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchesDate(value: string, referenceDate: Date) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === formatDateKey(referenceDate)) {
    return true;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    parsed.getFullYear() === referenceDate.getFullYear() &&
    parsed.getMonth() === referenceDate.getMonth() &&
    parsed.getDate() === referenceDate.getDate()
  );
}

function readValue(record: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = record[alias];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

export async function getTodayPlanningRow(referenceDate = new Date()) {
  const sheets = getGoogleSheetsClient();
  const { spreadsheetId, sheetName } = getGoogleConfigSnapshot();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:AZ500`
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) {
    return null;
  }

  const header = rows[0].map((cell) => normalizeHeader(String(cell ?? "")));
  const row = rows.slice(1).find((cells) => matchesDate(String(cells[0] ?? ""), referenceDate));
  if (!row) {
    return null;
  }

  const record: Record<string, string> = {};
  header.forEach((key, index) => {
    record[key] = String(row[index] ?? "").trim();
  });

  const topPriorities = [
    readValue(record, ["top1"]),
    readValue(record, ["top2"]),
    readValue(record, ["top3"]),
    ...splitList(readValue(record, ["toppriorities"]))
  ].filter(Boolean);

  return {
    date: readValue(record, ["date"]) || formatDateKey(referenceDate),
    workdayWindow: readValue(record, ["workdaywindow"]),
    dayType: readValue(record, ["daytype"]),
    availableWorkBlocks: splitList(readValue(record, ["availableworkblocks"])),
    bestDeepWorkBlock: readValue(record, ["bestdeepworkblock"]),
    topPriorities,
    quickWins: splitList(readValue(record, ["quickwins"])),
    notes: readValue(record, ["notes"]),
    energy: readValue(record, ["energy"]),
    mustBeforeNoon: readValue(record, ["mustbeforenoon"]),
    quickStartQueue: splitList(readValue(record, ["quickstartqueue"])),
    morningLaunch: splitList(readValue(record, ["morninglaunch"])),
    outlookSweep: readValue(record, ["outlooksweep"]),
    gratitude: readValue(record, ["gratitude"]),
    relationshipConnection: readValue(record, ["relationshipconnection"]),
    raw: record
  };
}
