import { createHash, createHmac, randomUUID } from "node:crypto";
import type { RunnerConfig } from "./config.js";
import type { Claim, WorkerResult } from "./types.js";

export function signRequest(method: string, path: string, timestamp: string, requestId: string, body: string, secret: string) {
  const hash = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update([method.toUpperCase(), path, timestamp, requestId, hash].join("\n")).digest("hex");
}
export class RyanOsClient {
  constructor(private config: RunnerConfig, private fetcher: typeof fetch = fetch) {}
  private async post<T>(path: string, payload: unknown): Promise<T> {
    const body = JSON.stringify(payload); const timestamp = new Date().toISOString(); const requestId = randomUUID();
    const response = await this.fetcher(new URL(path, this.config.RYANOS_BASE_URL), { method: "POST", body, headers: { "content-type": "application/json",
      "x-ryanos-key-id": this.config.RYANOS_RUNNER_KEY_ID, "x-ryanos-timestamp": timestamp, "x-ryanos-request-id": requestId,
      "x-ryanos-signature": signRequest("POST", path, timestamp, requestId, body, this.config.RYANOS_RUNNER_HMAC_SECRET) } });
    const envelope = await response.json() as { ok: boolean; data?: T; error?: string };
    if (!response.ok || !envelope.ok) throw new Error(envelope.error ?? `RyanOS request failed (${response.status}).`);
    return envelope.data as T;
  }
  claim(capabilities: string[]) { return this.post<Claim | null>("/api/runner/claim", { capabilities, version: this.config.RUNNER_VERSION }); }
  heartbeat(claim: Claim) { return this.post<{ leaseExpiresAt: string }>("/api/runner/heartbeat", { workItemId: claim.workItemId, claimToken: claim.claimToken }); }
  result(claim: Claim, result: WorkerResult) { return this.post("/api/runner/result", { workItemId: claim.workItemId, claimToken: claim.claimToken, result }); }
  failure(claim: Claim, error: string, evidence = "") { return this.post("/api/runner/failure", { workItemId: claim.workItemId, claimToken: claim.claimToken, error, evidence }); }
  release(claim: Claim, reason: string) { return this.post("/api/runner/release", { workItemId: claim.workItemId, claimToken: claim.claimToken, reason }); }
}
