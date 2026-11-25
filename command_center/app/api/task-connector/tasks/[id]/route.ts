import { taskConnector } from "@/server/task-connector";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return taskConnector.get(request, (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  return taskConnector.update(request, (await context.params).id);
}
