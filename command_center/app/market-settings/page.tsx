import { saveSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUserWithSettings } from "@/lib/session";

export default async function MarketSettingsPage() {
  const { settings } = await requireUserWithSettings();

  return (
    <main className="space-y-6">
      <h2 className="text-2xl font-semibold">Market Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>Risk + Management Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveSettingsAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm">Account size (optional)</label>
              <Input defaultValue={settings.accountSize ?? ""} name="accountSize" type="number" min="0" step="100" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Max risk per trade (%)</label>
              <Input
                defaultValue={settings.maxRiskPerTradePercent}
                name="maxRiskPerTradePercent"
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Preferred DTE min</label>
              <Input defaultValue={settings.preferredDteMin} name="preferredDteMin" type="number" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Preferred DTE max</label>
              <Input defaultValue={settings.preferredDteMax} name="preferredDteMax" type="number" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Earnings buffer (days)</label>
              <Input defaultValue={settings.earningsBufferDays} name="earningsBufferDays" type="number" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Sector concentration limit</label>
              <Input defaultValue={settings.concentrationLimit} name="concentrationLimit" type="number" required />
            </div>
            <label className="col-span-full flex items-center gap-2 text-sm">
              <input defaultChecked={settings.definedRiskOnly} name="definedRiskOnly" type="checkbox" className="h-4 w-4" />
              Defined-risk preference only
            </label>
            <Button className="md:col-span-2" type="submit">
              Save Market Settings
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
