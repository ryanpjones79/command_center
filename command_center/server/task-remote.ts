import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { taskOAuthHandlers } from "@/server/task-oauth-http";
import { remoteTaskMcp } from "@/server/task-remote-mcp";
export const remoteTaskOAuth = taskOAuthHandlers(prisma, auth);
export const remoteTaskTools = remoteTaskMcp(prisma, process.env, () => {
  for (const path of [
    "/",
    "/tasks",
    "/time-blocks",
    "/projects",
    "/weekly-review",
  ])
    revalidatePath(path);
});
