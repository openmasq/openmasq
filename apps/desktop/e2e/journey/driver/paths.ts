import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The Electron app's root — this is the path passed to `electron.launch`. */
export const DESKTOP_DIR = resolve(HERE, "../../..");

/**
 * Everything the session produces lives here, and NOTHING else: screenshots, journals,
 * disposable profile, socket. A single folder, git-ignored, that can be erased without a
 * second thought — and that the skill knows to cite to the agent without guessing.
 */
export const RUN_DIR = resolve(DESKTOP_DIR, "e2e/.journey");
export const SOCK = resolve(RUN_DIR, "daemon.sock");
export const SHOTS = resolve(RUN_DIR, "captures");
export const PROFILE = resolve(RUN_DIR, "profil");
/** The logbook: one JSON line per command, it's the trace the agent re-reads. */
export const LOG_FILE = resolve(RUN_DIR, "journal.jsonl");
/** The driver's own log (stdout/stderr of the daemon) — to understand a dead daemon. */
export const DAEMON_LOG = resolve(RUN_DIR, "daemon.log");
/**
 * The main process's output when the app is launched BY SOMEONE ELSE (attached mode).
 * The driver then holds no pipe: this file is what carries `[mcp:raw]` and the
 * exceptions, so half the proof. `devApp.ts` / `suivreLog.ts` say the rest.
 */
export const MAIN_LOG = resolve(RUN_DIR, "main.log");
/** The REAL (un-redacted) arguments received by a FIXTURE MCP tool — rule 11, outbound direction.
 *  On REAL connectors the equivalent is `OPENMASQ_MCP_RAW_LOG`, which writes to the
 *  main process's output (so into `errors`), because it lives in the real dispatch path. */
export const TOOLCALL_LOG = resolve(RUN_DIR, "toolcalls.jsonl");
/**
 * What EACH provider call carried: provider, model, messages, tool names.
 * It's the only proof of the promise when the destination is a real model — the fake
 * endpoint, meanwhile, kept the bodies in memory. ⚠️ Contains REAL PII in real mode.
 */
export const WIRE_LOG = resolve(RUN_DIR, "wire.jsonl");
/**
 * The FIXTURE connectors catalog — simulated accounts, no real account touched.
 * It's the SAME ONE from the e2e workflows, not a second copy: its tools, its argument
 * schemas and its result formats are already transcribed from the real connectors, and a second
 * list would drift from the first with nothing to say so (rule 9).
 */
export const MCP_FIXTURES = resolve(DESKTOP_DIR, "e2e/fixtures/mcp/workflows.json");

export function ensureRunDir(): void {
  for (const d of [RUN_DIR, SHOTS]) mkdirSync(d, { recursive: true });
}
