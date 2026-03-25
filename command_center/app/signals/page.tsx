import Link from "next/link";
import { deleteSignalFilterAction, saveSignalFilterAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Announcement, AnnouncementTag, AnnouncementTitle } from "@/components/kibo-ui/announcement";
import { SetupToolbarActions } from "@/components/signals/setup-toolbar-actions";
import { requireUser } from "@/lib/session";
import { type SetupTier, type SignalTimeframe, buildSignalRows } from "@/server/signal-service";
import { PREDEFINED_GROUPS, getGroupSymbols, getSavedSignalFilters } from "@/server/setup-filters-service";

function toQuery(current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  return `/signals?${params.toString()}`;
}

function tierVariant(tier: SetupTier): "success" | "danger" | "secondary" {
  return tier === "Bullish" ? "success" : tier === "Bearish" ? "danger" : "secondary";
}

function stratVariant(label: string | null): "success" | "danger" | "warning" | "secondary" {
  if (label === "2u") return "success";
  if (label === "2d") return "danger";
  if (label === "3") return "warning";
  return "secondary";
}

function currentQueryString(current: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export default async function SignalsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const query = await searchParams;

  const current: Record<string, string | undefined> = {
    tf: Array.isArray(query.tf) ? query.tf[0] : query.tf,
    setup: Array.isArray(query.setup) ? query.setup[0] : query.setup,
    pmg: Array.isArray(query.pmg) ? query.pmg[0] : query.pmg,
    q: Array.isArray(query.q) ? query.q[0] : query.q,
    limit: Array.isArray(query.limit) ? query.limit[0] : query.limit,
    group: Array.isArray(query.group) ? query.group[0] : query.group
  };

  const tf = (current.tf === "W" || current.tf === "M" ? current.tf : "D") as SignalTimeframe;
  const setup = (current.setup === "Bullish" || current.setup === "Bearish" || current.setup === "Neutral"
    ? current.setup
    : "All") as SetupTier | "All";
  const pmgOnly = current.pmg === "1";
  const q = current.q ?? "";
  const limit = Number(current.limit ?? "250");
  const group = current.group ?? "All Symbols";

  const [savedFilters, signals] = await Promise.all([
    getSavedSignalFilters(user.id),
    buildSignalRows(user.id, {
      timeframe: tf,
      setup,
      pmgOnly,
      symbolContains: q,
      allowedSymbols: getGroupSymbols(group),
      limit: Number.isFinite(limit) ? limit : 250
    })
  ]);

  const queryString = currentQueryString(current);

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-4xl font-bold tracking-tight">Setups</h2>
          <p className="text-muted-foreground">Filter and review the latest triggered setups.</p>
        </div>
        <SetupToolbarActions queryString={queryString} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/70 p-3">
        {(["D", "W", "M"] as SignalTimeframe[]).map((chip) => (
          <Button asChild key={chip} size="sm" variant={chip === tf ? "default" : "outline"}>
            <Link href={toQuery(current, { tf: chip })}>{chip}</Link>
          </Button>
        ))}
        <div className="mx-2 h-6 w-px bg-border" />
        <Button asChild size="sm" variant={pmgOnly ? "default" : "outline"}>
          <Link href={toQuery(current, { pmg: pmgOnly ? undefined : "1" })}>PMG</Link>
        </Button>
        <Button asChild size="sm" variant={setup === "Bullish" ? "default" : "outline"}>
          <Link href={toQuery(current, { setup: "Bullish" })}>Bullish</Link>
        </Button>
        <Button asChild size="sm" variant={setup === "Bearish" ? "default" : "outline"}>
          <Link href={toQuery(current, { setup: "Bearish" })}>Bearish</Link>
        </Button>
        <Button asChild size="sm" variant={setup === "Neutral" ? "default" : "outline"}>
          <Link href={toQuery(current, { setup: "Neutral" })}>Neutral</Link>
        </Button>
        <Button asChild size="sm" variant={setup === "All" ? "secondary" : "outline"}>
          <Link href={toQuery(current, { setup: "All" })}>All</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {savedFilters.length === 0 ? (
              <span className="text-sm text-muted-foreground">No saved filters yet.</span>
            ) : (
              savedFilters.map((filter) => (
                <div key={filter.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
                  <Link className="text-sm hover:underline" href={`/signals?${filter.query}`}>
                    {filter.name}
                  </Link>
                  <form action={deleteSignalFilterAction}>
                    <input name="id" type="hidden" value={filter.id} />
                    <button className="text-muted-foreground hover:text-foreground" type="submit">
                      x
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
          <form action={saveSignalFilterAction} className="grid gap-2 md:grid-cols-4">
            <input name="query" type="hidden" value={queryString} />
            <Input className="md:col-span-3" name="name" placeholder="Name this filter" required />
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Predefined Lists</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" method="get">
            <input name="tf" type="hidden" value={tf} />
            <input name="setup" type="hidden" value={setup} />
            <input name="pmg" type="hidden" value={pmgOnly ? "1" : "0"} />
            <input name="q" type="hidden" value={q} />
            <input name="limit" type="hidden" value={String(limit)} />
            <select className="h-9 rounded-md border bg-background px-3 md:col-span-3" defaultValue={group} name="group">
              {Object.keys(PREDEFINED_GROUPS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Announcement>
        <AnnouncementTag>Vol Tier</AnnouncementTag>
        <AnnouncementTitle>
          Proxy volatility is shown by default unless true IV is available. PMG is directional progression score.
        </AnnouncementTitle>
      </Announcement>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5" method="get">
            <input name="tf" type="hidden" value={tf} />
            <input name="setup" type="hidden" value={setup} />
            <input name="pmg" type="hidden" value={pmgOnly ? "1" : "0"} />
            <input name="group" type="hidden" value={group} />
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-muted-foreground">Symbol contains</label>
              <Input defaultValue={q} name="q" placeholder="AAPL, SPY, PYPL" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Limit</label>
              <Input defaultValue={String(limit)} max={500} min={10} name="limit" type="number" />
            </div>
            <div className="md:col-span-2 flex items-end gap-2">
              <Button type="submit">Search</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/signals">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Triggered Setups ({signals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>TF</TableHead>
                <TableHead>TFC</TableHead>
                <TableHead>C2</TableHead>
                <TableHead>C1</TableHead>
                <TableHead>PMG</TableHead>
                <TableHead>Last</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Bias</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Earnings</TableHead>
                <TableHead>Liquidity</TableHead>
                <TableHead>Concentration</TableHead>
                <TableHead>RV20</TableHead>
                <TableHead>Vol Context</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((signal) => (
                <TableRow key={signal.symbol}>
                  <TableCell className="font-medium">
                    <Link className="text-primary hover:underline" href={`/chart/${signal.symbol}`}>
                      {signal.symbol}
                    </Link>
                  </TableCell>
                  <TableCell>{signal.tf}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={stratVariant(signal.tfc.d)}>D</Badge>
                      <Badge variant={stratVariant(signal.tfc.w)}>W</Badge>
                      <Badge variant={stratVariant(signal.tfc.m)}>M</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stratVariant(signal.c2)}>{signal.c2 ?? "-"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stratVariant(signal.c1)}>{signal.c1 ?? "-"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={signal.pmg >= 5 ? "default" : "secondary"}>{signal.pmg}</Badge>
                  </TableCell>
                  <TableCell>
                    {signal.lastClose.toFixed(2)}
                    <div className="text-xs text-muted-foreground">{signal.lastDate.toISOString().slice(0, 10)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tierVariant(signal.setupTier)}>{signal.setupTier}</Badge>
                  </TableCell>
                  <TableCell>
                    {signal.strat.daily ?? "-"}/{signal.strat.weekly ?? "-"}/{signal.strat.monthly ?? "-"}
                  </TableCell>
                  <TableCell>{signal.strategyHint}</TableCell>
                  <TableCell>{signal.checklist.earnings}</TableCell>
                  <TableCell>{signal.checklist.liquidity}</TableCell>
                  <TableCell>{signal.checklist.concentration}</TableCell>
                  <TableCell>{signal.rv20?.toFixed(1) ?? "-"}</TableCell>
                  <TableCell>{signal.checklist.vol}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
