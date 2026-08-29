import { spawn } from "node:child_process";
export async function run(command: string, args: string[], cwd: string, timeoutMs = 300000) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const isWindowsScript = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const executable = isWindowsScript ? process.env.ComSpec ?? "cmd.exe" : command;
    const executableArgs = isWindowsScript ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(executable, executableArgs, { cwd, shell: false, windowsHide: true, env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", TEMP: process.env.TEMP ?? "", TMP: process.env.TMP ?? "", ComSpec: process.env.ComSpec ?? "" } });
    let stdout = "", stderr = ""; const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out.`)); }, timeoutMs);
    child.stdout.on("data", (v) => stdout += String(v)); child.stderr.on("data", (v) => stderr += String(v)); child.on("error", reject);
    child.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? -1 }); });
  });
}
