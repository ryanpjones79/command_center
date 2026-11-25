import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { authenticateTaskRequest } from "@/server/task-connector-auth";
import { createTaskConnectorService } from "@/server/task-connector-service";
import { taskHandlers } from "@/server/task-connector-http";

export const taskConnector = taskHandlers(
  createTaskConnectorService(prisma),
  (request, operation) => authenticateTaskRequest(request, operation, auth),
  () => {
    for (const path of [
      "/",
      "/tasks",
      "/time-blocks",
      "/projects",
      "/weekly-review",
    ])
      revalidatePath(path);
  },
);
