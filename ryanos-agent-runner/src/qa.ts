import type { Workspace } from "./config.js";
import { run } from "./process.js";
import type { WorkerResult } from "./types.js";
import type { WorktreeManager } from "./worktree.js";

const prohibited = /(^|\/)(\.env($|\.)|.*secret.*|credentials?\.|id_rsa|\.pem$)/i;
export async function verifyRepositoryResult(worktreeManager: WorktreeManager, worktree: string, workspace: Workspace, codex: Omit<WorkerResult, "branch" | "worktree">, baseCommit?: string) {
  const inspection = await worktreeManager.inspect(worktree, baseCommit);
  const unexpected = inspection.filesChanged.filter((file) => prohibited.test(file.replaceAll("\\", "/")));
  const testLogs: string[] = []; let testsPassed = true;
  for (const test of workspace.testCommands) {
    const result = await run(test.command, test.args, worktree, 600000);
    testLogs.push(`$ ${test.command} ${test.args.join(" ")}\n${result.stdout}\n${result.stderr}`.trim());
    if (result.code !== 0) testsPassed = false;
  }
  const hasExpectedChange = inspection.filesChanged.length > 0 || codex.filesChanged.length === 0;
  const pass = codex.status === "SUCCEEDED" && codex.acceptanceCriteriaSatisfied && testsPassed && unexpected.length === 0 && hasExpectedChange;
  return { ...codex, status: pass ? "SUCCEEDED" as const : "FAILED" as const, filesChanged: inspection.filesChanged,
    testsRun: workspace.testCommands.map((v) => `${v.command} ${v.args.join(" ")}`), testResults: testLogs.join("\n\n"), commitSha: inspection.commitSha,
    evidence: [codex.evidence, inspection.evidence, ...testLogs].filter(Boolean).join("\n\n").slice(0, 30000),
    acceptanceCriteriaSatisfied: pass, recommendedQaAction: pass ? "PASS" as const : (unexpected.length ? "ESCALATE" as const : "REPAIR" as const),
    qaFeedback: pass ? "Independent diff and registered-test verification passed." : unexpected.length ? `Prohibited sensitive files changed: ${unexpected.join(", ")}` : "Independent verification found a failed test or unmet criterion." };
}
