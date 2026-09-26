// `openmasq-proxy -- <command…>`: run a tool with its base URLs pointed at the proxy, let it
// own the terminal, and stop the proxy when it exits. The proxy's own lines go to a log
// file meanwhile — a TUI (Claude Code, Codex) would otherwise paint over them.
import { spawn } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { envLines } from "./baseUrls.js";
import { openmasqDir } from "./stateDir.js";

export function defaultLogFile(): string {
  return join(openmasqDir(), "proxy.log");
}

/**
 * Is `command` runnable — a path that exists, or a bare name found on PATH? Asked BEFORE the
 * run starts, so a tool that is not installed is reported as such rather than as whatever
 * fails first downstream. Cheap and side-effect free.
 */
export function onPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  // On Windows the executable carries an extension the user does not type.
  const exts = process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) if (existsSync(join(dir, command + ext))) return true;
  }
  return false;
}

/** Past this, the log is rotated to `<file>.1` and a fresh one started. Bounded on purpose:
 *  an append-only file that a wrapper writes to on every run grows for the life of the
 *  install, and nobody ever notices until it is large. */
export const LOG_MAX_BYTES = 4 * 1024 * 1024;

/**
 * A line writer to `file` (created with its folder), appending.
 *
 * ⚠️ 0600, and it matters where the file is. The log carries no VALUE — counts, categories,
 * routes and timings only — but it describes a person's activity minute by minute, and
 * `--log` can point at a directory everyone can read. The mode is set here so the
 * destination cannot make it worse.
 */
export function fileWriter(file: string): (line: string) => void {
  mkdirSync(dirname(file), { recursive: true });
  rotate(file);
  // Create it NOW, before the stream: `createWriteStream` opens lazily, so a mode set on a
  // file that does not exist yet is a mode set on nothing.
  writeFileSync(file, "", { flag: "a", mode: 0o600 });
  const out = createWriteStream(file, { flags: "a", mode: 0o600 });
  try {
    chmodSync(file, 0o600); // an existing file keeps its old mode without this
  } catch {
    // A filesystem with no permission model (exFAT, a network share): the write still
    // works, and failing the run over the mode would help nobody.
  }
  return (line) => out.write(`${line}\n`);
}

/** Move an oversized log aside, keeping exactly one generation. */
function rotate(file: string): void {
  try {
    if (statSync(file).size < LOG_MAX_BYTES) return;
    renameSync(file, `${file}.1`);
  } catch {
    // Absent (the normal first run) or unrenameable: either way, appending is correct.
  }
}

/** Loopback, in the spellings HTTP clients match `NO_PROXY` against. */
const LOOPBACK = ["127.0.0.1", "localhost", "::1"];

/**
 * The child's environment: the caller's, plus the three base URLs — and loopback exempted
 * from any HTTP proxy. A client honouring `HTTP_PROXY` (or the OS's proxy settings, which
 * Python's `getproxies()` reads when no variable is set) would otherwise send its request —
 * the body NOT YET MASKED, with the API key — to that proxy on its way to us.
 */
export function wrappedEnv(url: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const l of envLines(url)) {
    const i = l.indexOf("=");
    out[l.slice(0, i)] = l.slice(i + 1);
  }
  for (const key of ["NO_PROXY", "no_proxy"]) {
    const have = (out[key] ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    out[key] = [...new Set([...have, ...LOOPBACK])].join(",");
  }
  return out;
}

/**
 * Run `command` on the terminal; resolves with its exit code. `extraArgs` comes from the
 * caller — with `--mcp` it is what makes the client speak to our endpoint and no other. They
 * go FIRST, because a client's global flags must precede its subcommand; nothing the user
 * wrote is removed or reordered. `extraEnv` is what a client whose model endpoint the base
 * URLs do not reach needs instead (`features/vibe`).
 */
export function runWrapped(
  command: string[],
  url: string,
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const args = [...extraArgs, ...command.slice(1)];
    const env = { ...wrappedEnv(url), ...extraEnv };
    const child = spawn(command[0], args, { stdio: "inherit", env });
    child.on("error", (err) => {
      process.stderr.write(`cannot start ${command[0]}: ${err.message}\n`);
      resolve(127);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 130 : 1)));
  });
}
