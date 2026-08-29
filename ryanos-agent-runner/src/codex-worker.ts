import { Codex } from "@openai/codex-sdk";
import { z } from "zod";
import type { RunnerConfig } from "./config.js";
import type { Claim } from "./types.js";

const codexOutputSchema = { type: "object", additionalProperties: false, required: ["status", "summary", "filesChanged", "testsRun", "testResults", "unresolvedIssues", "evidence", "acceptanceCriteriaSatisfied", "recommendedQaAction"], properties: {
  status: { type: "string", enum: ["SUCCEEDED", "FAILED"] }, summary: { type: "string" }, filesChanged: { type: "array", items: { type: "string" } }, testsRun: { type: "array", items: { type: "string" } },
  testResults: { type: "string" }, unresolvedIssues: { type: "array", items: { type: "string" } }, evidence: { type: "string" }, acceptanceCriteriaSatisfied: { type: "boolean" }, recommendedQaAction: { type: "string", enum: ["PASS", "REPAIR", "ESCALATE"] }
} };
const outputValidator = z.object({ status: z.enum(["SUCCEEDED", "FAILED"]), summary: z.string(), filesChanged: z.array(z.string()), testsRun: z.array(z.string()), testResults: z.string(), unresolvedIssues: z.array(z.string()), evidence: z.string(), acceptanceCriteriaSatisfied: z.boolean(), recommendedQaAction: z.enum(["PASS", "REPAIR", "ESCALATE"]) });

export type CodexFactory = (env: Record<string, string>) => Pick<Codex, "startThread" | "resumeThread">;
export class CodexWorker {
  constructor(private config: RunnerConfig, private factory: CodexFactory = (env) => new Codex({ env })) {}
  async execute(claim: Claim, workingDirectory: string) {
    if (this.config.FEATURE_CODEX_EXECUTION !== "true") throw new Error("Codex execution kill switch is disabled.");
    const env: Record<string, string> = {};
    for (const key of ["PATH", "SystemRoot", "TEMP", "TMP", "USERPROFILE", "CODEX_HOME", "OPENAI_API_KEY"]) if (process.env[key]) env[key] = process.env[key]!;
    const codex = this.factory(env);
    const options = { ...(this.config.CODEX_MODEL ? { model: this.config.CODEX_MODEL } : {}), workingDirectory, skipGitRepoCheck: false,
      sandboxMode: claim.allowedCapability === "CODEX_REVIEW" ? "read-only" as const : "workspace-write" as const,
      networkAccessEnabled: false, webSearchMode: "disabled" as const, approvalPolicy: "never" as const, additionalDirectories: [] };
    const thread = claim.externalThreadId ? codex.resumeThread(claim.externalThreadId, options) : codex.startThread(options);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.CODEX_TIMEOUT_MS);
    const prompt = [`PROJECT OBJECTIVE\n${claim.projectObjective}`, `CURRENT BOTTLENECK\n${claim.currentBottleneck}`, `WORK ITEM OBJECTIVE\n${claim.objective}`,
      `EXPECTED VALUE\n${claim.expectedValue}`, `ACCEPTANCE CRITERIA\n${claim.acceptanceCriteria}`,
      `REPOSITORY RULES\nRespect AGENTS.md. Stay inside the explicit working directory and current branch. Do not merge, deploy, or access unrelated directories.`,
      `ALLOWED CAPABILITY\n${claim.allowedCapability}`, `PROHIBITED ACTIONS\nNo external communications, spending, purchases, production deploys, destructive operations, credentials, secrets, PHI, unrestricted shell, or scope expansion. Network is off.`,
      `RELEVANT CONTEXT\n${claim.operationalContext ?? "None"}`, `TEST REQUIREMENTS\nRun only repository-relevant tests. The runner will independently verify the actual diff and registered tests.`,
      `REQUIRED RESULT FORMAT\nReturn only the requested structured operational result. Do not include hidden reasoning.`].join("\n\n");
    try {
      const turn = await thread.run(prompt, { outputSchema: codexOutputSchema, signal: controller.signal });
      const normalized = outputValidator.parse(JSON.parse(turn.finalResponse));
      return { ...normalized, externalThreadId: thread.id ?? undefined, providerIdentifier: "openai-codex-sdk", modelIdentifier: this.config.CODEX_MODEL || "account-default" };
    } finally { clearTimeout(timer); }
  }
}
