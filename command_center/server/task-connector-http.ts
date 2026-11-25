import {
  TaskConnectorError,
  type TaskAccess,
} from "@/lib/task-connector-contract";

const headers = {
  "Cache-Control": "no-store",
  Vary: "Cookie, Authorization, Origin",
};
export async function taskHttpResponse(
  work: () => Promise<unknown>,
  successStatus = 200,
) {
  try {
    return Response.json(await work(), { status: successStatus, headers });
  } catch (error) {
    if (error instanceof TaskConnectorError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers },
      );
    }
    // Never return database diagnostics, request bodies, credential values or stack traces.
    return Response.json(
      {
        error: {
          code: "TASK_SERVICE_ERROR",
          message:
            "Task operation could not be confirmed. Read current state before retrying.",
        },
      },
      { status: 500, headers },
    );
  }
}
export async function taskRequestBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new TaskConnectorError(415, "JSON_REQUIRED", "Use application/json.");
  }
  const max = 16_384;
  if (Number(request.headers.get("content-length")) > max)
    throw new TaskConnectorError(
      413,
      "BODY_TOO_LARGE",
      "Task payload is too large.",
    );
  // Stream with a byte bound; Content-Length can be missing or forged.
  const reader = request.body?.getReader();
  if (!reader)
    throw new TaskConnectorError(
      400,
      "INVALID_JSON",
      "A JSON object is required.",
    );
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new TaskConnectorError(
        413,
        "BODY_TOO_LARGE",
        "Task payload is too large.",
      );
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TaskConnectorError(
      400,
      "INVALID_JSON",
      "A JSON object is required.",
    );
  }
}

export type TaskAuthenticator = (
  request: Request,
  operation: TaskAccess["operations"][number],
) => Promise<TaskAccess>;
export type TaskService = ReturnType<
  typeof import("@/server/task-connector-service").createTaskConnectorService
>;
export function taskHandlers(
  service: TaskService,
  authenticate: TaskAuthenticator,
  revalidate: () => void = () => {},
) {
  return {
    catalog: (request: Request) =>
      taskHttpResponse(async () =>
        service.catalog(await authenticate(request, "read")),
      ),
    list: (request: Request) =>
      taskHttpResponse(async () => {
        const access = await authenticate(request, "read");
        return service.list(
          access,
          Object.fromEntries(new URL(request.url).searchParams),
        );
      }),
    get: (request: Request, id: string) =>
      taskHttpResponse(async () =>
        service.get(await authenticate(request, "read"), id),
      ),
    create: (request: Request) =>
      taskHttpResponse(async () => {
        const access = await authenticate(request, "create");
        const result = await service.create(
          access,
          await taskRequestBody(request),
        );
        // Writes are already committed. Cache refresh failures must not masquerade as failed writes.
        try {
          revalidate();
        } catch {
          /* readback remains authoritative */
        }
        return result;
      }),
    update: (request: Request, id: string) =>
      taskHttpResponse(async () => {
        const access = await authenticate(request, "update");
        const result = await service.update(
          access,
          id,
          await taskRequestBody(request),
        );
        try {
          revalidate();
        } catch {
          /* readback remains authoritative */
        }
        return result;
      }),
  };
}
