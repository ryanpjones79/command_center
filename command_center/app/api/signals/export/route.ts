import { auth } from "@/auth";
import { buildSignalRows, type SetupTier, type SignalTimeframe } from "@/server/signal-service";
import { getGroupSymbols } from "@/server/setup-filters-service";

function csvEscape(value: string | number) {
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/\"/g, '""')}"`;
  }
  return raw;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tfRaw = searchParams.get("tf");
  const setupRaw = searchParams.get("setup");
  const pmgRaw = searchParams.get("pmg");
  const q = searchParams.get("q") ?? "";
  const group = searchParams.get("group") ?? "All Symbols";
  const limitRaw = Number(searchParams.get("limit") ?? "250");

  const tf = (tfRaw === "W" || tfRaw === "M" ? tfRaw : "D") as SignalTimeframe;
  const setup = (setupRaw === "Bullish" || setupRaw === "Bearish" || setupRaw === "Neutral"
    ? setupRaw
    : "All") as SetupTier | "All";

  const rows = await buildSignalRows(session.user.id, {
    timeframe: tf,
    setup,
    pmgOnly: pmgRaw === "1",
    symbolContains: q,
    allowedSymbols: getGroupSymbols(group),
    limit: Number.isFinite(limitRaw) ? limitRaw : 250
  });

  const header = [
    "Symbol",
    "TF",
    "Tier",
    "PMG",
    "C2",
    "C1",
    "TFC_D",
    "TFC_W",
    "TFC_M",
    "LastClose",
    "LastDate",
    "Strategy",
    "Earnings",
    "Liquidity",
    "Concentration",
    "RV20"
  ];

  const lines = rows.map((row) => [
    row.symbol,
    row.tf,
    row.setupTier,
    row.pmg,
    row.c2 ?? "",
    row.c1 ?? "",
    row.tfc.d ?? "",
    row.tfc.w ?? "",
    row.tfc.m ?? "",
    row.lastClose.toFixed(2),
    row.lastDate.toISOString().slice(0, 10),
    row.strategyHint,
    row.checklist.earnings,
    row.checklist.liquidity,
    row.checklist.concentration,
    row.rv20?.toFixed(1) ?? ""
  ]);

  const csv = [header, ...lines].map((cols) => cols.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=signals-${new Date().toISOString().slice(0, 10)}.csv`
    }
  });
}
