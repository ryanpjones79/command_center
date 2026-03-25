import { notFound } from "next/navigation";
import { Timeframe } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { classifySeries } from "@/strat/classifier";
import { sma } from "@/lib/indicators";
import { TickerChart } from "@/components/charts/ticker-chart";

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10) as `${number}-${number}-${number}`;
}

function badgeVariant(label: string | null): "secondary" | "success" | "danger" | "warning" {
  if (label === "2u") return "success";
  if (label === "2d") return "danger";
  if (label === "3") return "warning";
  return "secondary";
}

export default async function ChartPage({ params }: { params: Promise<{ symbol: string }> }) {
  await requireUser();
  const { symbol } = await params;
  const upper = symbol.toUpperCase();

  const [daily, weekly, monthly] = await Promise.all([
    prisma.priceBar.findMany({
      where: { symbol: upper, timeframe: Timeframe.DAILY },
      orderBy: { date: "asc" },
      take: 300
    }),
    prisma.priceBar.findMany({
      where: { symbol: upper, timeframe: Timeframe.WEEKLY },
      orderBy: { date: "asc" },
      take: 80
    }),
    prisma.priceBar.findMany({
      where: { symbol: upper, timeframe: Timeframe.MONTHLY },
      orderBy: { date: "asc" },
      take: 50
    })
  ]);

  if (daily.length === 0) {
    notFound();
  }

  const closes = daily.map((bar) => bar.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  const chartData = daily.map((bar, index) => ({
    time: toDateInput(bar.date),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    sma20: sma20[index],
    sma50: sma50[index],
    sma200: sma200[index]
  }));

  const dState = classifySeries(daily).at(-1)?.stratLabel ?? null;
  const wState = classifySeries(weekly).at(-1)?.stratLabel ?? null;
  const mState = classifySeries(monthly).at(-1)?.stratLabel ?? null;

  const last20 = classifySeries(daily.slice(-20));

  return (
    <main className="space-y-6">
      <h2 className="text-2xl font-semibold">{upper} Chart</h2>

      <Card>
        <CardHeader>
          <CardTitle>Candles + SMA20/50/200</CardTitle>
        </CardHeader>
        <CardContent>
          <TickerChart data={chartData} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Daily</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={badgeVariant(dState)}>{dState ?? "-"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weekly</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={badgeVariant(wState)}>{wState ?? "-"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={badgeVariant(mState)}>{mState ?? "-"}</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 20 Daily Bars with Strat Labels</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>High</TableHead>
                <TableHead>Low</TableHead>
                <TableHead>Close</TableHead>
                <TableHead>Strat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {last20.map((bar) => (
                <TableRow key={bar.date.toISOString()}>
                  <TableCell>{bar.date.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>{bar.open.toFixed(2)}</TableCell>
                  <TableCell>{bar.high.toFixed(2)}</TableCell>
                  <TableCell>{bar.low.toFixed(2)}</TableCell>
                  <TableCell>{bar.close.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant(bar.stratLabel)}>{bar.stratLabel ?? "-"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
