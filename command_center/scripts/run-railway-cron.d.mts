export const DEFAULT_AGENT_CRON_REQUEST_TIMEOUT_MS: number;
export const MIN_AGENT_CRON_REQUEST_TIMEOUT_MS: number;
export const MAX_AGENT_CRON_REQUEST_TIMEOUT_MS: number;

export function boundedAgentCronRequestTimeoutMs(
  value: string | number | null | undefined
): number;

export function invokeEndpoint(
  baseUrl: string,
  secret: string,
  operation: string,
  path: string,
  timeoutMs: number
): Promise<{
  ok: boolean;
  skipped?: boolean;
  failureReason?: "TIMEOUT" | "HTTP" | "NETWORK";
  status: number | null;
  body: string;
}>;

export function main(
  environment?: Record<string, string | undefined>
): Promise<number>;
