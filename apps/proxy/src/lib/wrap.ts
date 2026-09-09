// `openmasq-proxy -- <command…>`: run a tool with its base URLs pointed at the proxy, let it
// own the terminal, and stop the proxy when it exits. The proxy's own lines go to a log
// file meanwhile — a TUI (Claude Code, Codex) would otherwise paint over them.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { envLines } from "./baseUrls.js";

export function defaultLogFile(): string {
  return join(homedir(), ".openmasq", "proxy.log");
}

/** A line writer to `file` (created with its folder), appending. */
export function fileWriter(file: string): (line: string) => void {
  mkdirSync(dirname(file), { recursive: true });
  const out = createWriteStream(file, { flags: "a" });
  return (line) => out.write(`${line}\n`);
}

/** The child's environment: the caller's, plus the three base URLs. */
export function wrappedEnv(url: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const l of envLines(url)) {
    const i = l.indexOf("=");
    out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

/**
 * Run `command` on the terminal; resolves with its exit code. `extraArgs` comes from the
 * caller — with `--mcp` it is what makes the client speak to our endpoint and no other
 * (`features/mcp/clients.ts`).
 *
 * They go FIRST, before the user's own arguments, because a client's global flags have to
 * precede its subcommand: appended, `claude mcp list` receives them as arguments to `mcp`
 * and dies with « unknown option ». Nothing the user wrote is removed or reordered.
 */
export function runWrapped(
  command: string[],
  url: string,
  extraArgs: string[] = [],
): Promise<number> {
  return new Promise((resolve) => {
    const args = [...extraArgs, ...command.slice(1)];
    const child = spawn(command[0], args, { stdio: "inherit", env: wrappedEnv(url) });
    child.on("error", (err) => {
      process.stderr.write(`cannot start ${command[0]}: ${err.message}\n`);
      resolve(127);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 130 : 1)));
  });
}
