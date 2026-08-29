import { loadConfig } from "./config.js";
import { LocalRunner } from "./runner.js";
const config = loadConfig(); const runner = new LocalRunner(config); const once = process.argv.includes("--once");
do { await runner.once(); if (!once) await new Promise((resolve) => setTimeout(resolve, config.RUNNER_POLL_MS)); } while (!once);
