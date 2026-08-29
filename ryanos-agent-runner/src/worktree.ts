import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { run } from "./process.js";

export class WorktreeManager {
  constructor(private root: string) {}
  async create(canonicalPath: string, projectSlug: string, workItemId: string) {
    const repoCheck = await run("git", ["rev-parse", "--show-toplevel"], canonicalPath);
    if (repoCheck.code !== 0) throw new Error("Registered mutable workspace is not a Git repository.");
    const base = await run("git", ["rev-parse", "HEAD"], canonicalPath); if (base.code !== 0) throw new Error("Unable to resolve canonical repository HEAD.");
    const baseCommit = base.stdout.trim();
    const dirty = await run("git", ["status", "--porcelain"], canonicalPath);
    if (dirty.code !== 0 || dirty.stdout.trim()) throw new Error("Canonical repository is dirty; runner will not create mutable work from a human checkout with uncommitted changes.");
    const branch = `agent/${projectSlug}/${workItemId}`.replace(/[^a-zA-Z0-9/_-]/g, "-");
    const root = path.resolve(this.root); if (!existsSync(root)) mkdirSync(root, { recursive: true });
    const worktree = path.resolve(root, `${projectSlug}-${workItemId}`);
    if (!worktree.startsWith(root + path.sep)) throw new Error("Unsafe worktree path.");
    if (existsSync(worktree)) {
      const existingBranch = await run("git", ["branch", "--show-current"], worktree);
      if (existingBranch.code === 0 && existingBranch.stdout.trim() === branch) return { branch, worktree, baseCommit };
      throw new Error("Existing worktree path does not match the expected machine branch.");
    }
    const existing = await run("git", ["show-ref", "--verify", `refs/heads/${branch}`], canonicalPath);
    const args = existing.code === 0 ? ["worktree", "add", worktree, branch] : ["worktree", "add", "-b", branch, worktree, "HEAD"];
    const added = await run("git", args, canonicalPath); if (added.code !== 0) throw new Error(`Unable to create isolated worktree: ${added.stderr}`);
    return { branch, worktree, baseCommit };
  }
  async inspect(worktree: string, baseCommit = "HEAD") {
    const [diff, names, status, sha] = await Promise.all([run("git", ["diff", "--stat", baseCommit], worktree), run("git", ["diff", "--name-only", baseCommit], worktree), run("git", ["status", "--porcelain"], worktree), run("git", ["rev-parse", "HEAD"], worktree)]);
    const changed = names.stdout.split(/\r?\n/).filter(Boolean);
    const uncommitted = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1)!).filter(Boolean);
    return { evidence: `${diff.stdout}\n${status.stdout}`.trim(), filesChanged: [...new Set([...changed, ...uncommitted])], commitSha: sha.code === 0 ? sha.stdout.trim() : null };
  }
}
