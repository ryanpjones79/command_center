import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm({ error }: { error?: string }) {
  const message =
    error === "invalid-credentials"
      ? "Email or password was not accepted. Check the saved mobile password and try again."
      : error
        ? "Sign in failed. Try again."
        : null;

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Use local credentials from your environment variables.</CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </div>
        )}
        <form action={loginAction} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm">Email</label>
            <Input name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm">Password</label>
            <Input name="password" type="password" required />
          </div>
          <Button className="w-full" type="submit">
            Sign In
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
