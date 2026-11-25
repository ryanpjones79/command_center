import { taskConnector } from "@/server/task-connector";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = taskConnector.list;
export const POST = taskConnector.create;
