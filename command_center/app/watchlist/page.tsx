import Link from "next/link";
import { AddTickerForm } from "@/components/watchlist/add-ticker-form";
import { RefreshAllButton } from "@/components/watchlist/refresh-all-button";
import { RefreshTickerButton } from "@/components/watchlist/refresh-ticker-button";
import {
  Announcement,
  AnnouncementTag,
  AnnouncementTitle
} from "@/components/kibo-ui/announcement";
import { Status, StatusIndicator, StatusLabel } from "@/components/kibo-ui/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/session";
import { getWatchlistRows } from "@/server/dashboard-service";

function formatNumber(value: number | null, digits = 2) {
  return value === null ? "-" : value.toFixed(digits);
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "-";
}

function stratBadgeVariant(label: string | null): "secondary" | "success" | "danger" | "warning" {
  if (label === "2u") return "success";
  if (label === "2d") return "danger";
  if (label === "3") return "warning";
  return "secondary";
}

export default async function WatchlistPage() {
  const user = await requireUser();
  const rows = await getWatchlistRows(user.id);

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Watchlist</h2>
        <RefreshAllButton />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Announcement>
          <AnnouncementTag>EOD</AnnouncementTag>
          <AnnouncementTitle>Daily bars refresh nightly; intraday is intentionally disabled.</AnnouncementTitle>
        </Announcement>
        <Status status="online">
          <StatusIndicator />
          <StatusLabel>Data Providers Ready</StatusLabel>
        </Status>
      </div>

      <AddTickerForm />

      <Card>
        <CardHeader>
          <CardTitle>Actionable Grid (D/W/M)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Close</TableHead>
                <TableHead>Last Bar</TableHead>
                <TableHead>Src</TableHead>
                <TableHead>SMA20</TableHead>
                <TableHead>SMA50</TableHead>
                <TableHead>SMA200</TableHead>
                <TableHead>RV20%</TableHead>
                <TableHead>D</TableHead>
                <TableHead>W</TableHead>
                <TableHead>M</TableHead>
                <TableHead>Align</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.symbol}>
                  <TableCell>
                    <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/chart/${row.symbol}`}>
                      {row.symbol}
                    </Link>
                  </TableCell>
                  <TableCell>{formatNumber(row.latestClose)}</TableCell>
                  <TableCell>{formatDate(row.lastBarDate)}</TableCell>
                  <TableCell>{row.provider ?? "-"}</TableCell>
                  <TableCell>{formatNumber(row.sma20)}</TableCell>
                  <TableCell>{formatNumber(row.sma50)}</TableCell>
                  <TableCell>{formatNumber(row.sma200)}</TableCell>
                  <TableCell>{formatNumber(row.rv20, 1)}</TableCell>
                  <TableCell>
                    <Badge variant={stratBadgeVariant(row.daily)}>{row.daily ?? "-"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stratBadgeVariant(row.weekly)}>{row.weekly ?? "-"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stratBadgeVariant(row.monthly)}>{row.monthly ?? "-"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.alignment === "Bullish" ? "success" : row.alignment === "Bearish" ? "danger" : "secondary"
                      }
                    >
                      {row.alignment}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RefreshTickerButton symbol={row.symbol} />
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
