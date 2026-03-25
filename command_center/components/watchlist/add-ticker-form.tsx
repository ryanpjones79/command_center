import { addTickerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AddTickerForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add ticker</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={addTickerAction} className="grid gap-3 md:grid-cols-4">
          <Input name="symbol" placeholder="AAPL" required />
          <Input name="sector" placeholder="Technology" />
          <Input name="manualIvrBucket" placeholder="IVR bucket (manual)" />
          <Input name="nextEarningsDate" type="date" />
          <Button className="md:col-span-4" type="submit">
            Add / Update Ticker
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
