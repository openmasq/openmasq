import { randomBytes, timingSafeEqual } from "node:crypto";
import { readSync } from "node:fs";
import { filterChildEnv } from "../../childEnv";

/**
 * How the agent-browser child is LAUNCHED, and how it knows its launcher is the app.
 *
 * ## The launch handshake
 * The mode is selected by env (`OPENMASQ_AGENT_BROWSER=1`) because a packaged Electron
 * ignores an argv entry. Env alone is not an authentication: `launchctl setenv`, a
 * LaunchAgent, a user-scope Windows variable or a `.desktop` file can preset it, and the
 * signed binary would then start as a browser exposing CDP. So the parent mints a fresh
 * nonce, puts it in the child's env AND writes it as the first line of the child's stdin
 * (a pipe only the spawner holds); the child refuses to run unless both agree, BEFORE any
 * remote-debugging switch is appended. A preset environment has no such stdin (launchd
 * hands `/dev/null`). Residual: whoever execs the binary directly controls both channels —
 * that caller already runs code as the user.
 *
 * ## The child's environment is an ALLOW-list
 * `childEnv.ts`'s minimum (identity, paths, locale, proxies, Windows baseline) plus what a
 * GUI Chromium needs to put a window on screen and reach the network like the user's
 * session does (display server, D-Bus, CA overrides, the remaining locale categories).
 * Pinned by `agentLaunch.test.ts`.
 */

export const AGENT_NONCE_ENV = "OPENMASQ_AGENT_NONCE";
const NONCE_RE = /^[0-9a-f]{64}$/;
const MAX_LINE = 128;

/** What a GUI Chromium child needs beyond `childEnv.ts`'s baseline. Nothing secret. */
const AGENT_EXTRA_ENV = [
  // X11 / Wayland / session bus (Linux): without them no window appears.
  "DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE",
  "XDG_CURRENT_DESKTOP", "XDG_DATA_DIRS", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
  "DBUS_SESSION_BUS_ADDRESS", "GDK_BACKEND", "ELECTRON_OZONE_PLATFORM_HINT",
  // Locale categories beyond LANG/LC_ALL.
  "LANGUAGE", "LC_CTYPE", "LC_MESSAGES", "LC_TIME", "LC_NUMERIC", "LC_COLLATE", "LC_MONETARY",
  // SOCKS proxy + corporate CA overrides (TLS-intercepting proxies).
  "ALL_PROXY", "all_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
  // Windows shell folders and identity a Chromium child reads.
  "HOMEDRIVE", "HOMEPATH", "USERNAME", "USERDOMAIN", "ProgramFiles", "ProgramFiles(x86)",
  "ProgramW6432", "CommonProgramFiles", "PUBLIC", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  // macOS CoreFoundation text encoding.
  "__CF_USER_TEXT_ENCODING",
  // The cosmetic stealth kill switch (`agentMain.ts`); grants nothing.
  "OPENMASQ_AGENT_NO_STEALTH",
] as const;

/** A fresh launch nonce: 32 random bytes, hex. One per spawn. */
export function mintAgentNonce(): string {
  return randomBytes(32).toString("hex");
}

/** The agent child's environment: allow-listed inheritance + the variables main sets. */
export function agentChildEnv(
  set: Record<string, string>,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const key of AGENT_EXTRA_ENV) {
    const v = source[key];
    if (v !== undefined) extra[key] = v;
  }
  return filterChildEnv(source, { ...extra, ...set });
}

/** Parent side: the first line on the child's stdin. */
export function sendAgentNonce(stdin: NodeJS.WritableStream | null | undefined, nonce: string): void {
  stdin?.write(`${nonce}\n`);
}

type ReadFn = (buf: Buffer) => number;

const sleepMs = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Read ONE line from `read`, byte by byte (so nothing past the newline is consumed — the
 *  control channel continues on the same stdin). null on EOF, error, overlong or timeout. */
export function readLineSync(read: ReadFn, timeoutMs = 10_000, now = Date.now, maxLine = MAX_LINE): string | null {
  const deadline = now() + timeoutMs;
  const one = Buffer.alloc(1);
  let line = "";
  while (line.length <= maxLine) {
    let n: number;
    try {
      n = read(one);
    } catch (e) {
      // A non-blocking descriptor with nothing yet: wait for the parent's write.
      if ((e as NodeJS.ErrnoException).code === "EAGAIN" && now() < deadline) {
        sleepMs(10);
        continue;
      }
      return null;
    }
    if (n === 0) return null; // EOF: nobody is speaking on this stdin
    const ch = one.toString("latin1");
    if (ch === "\n") return line.replace(/\r$/, "");
    line += ch;
  }
  return null;
}

/** Child side, pure: does the stdin line match the env nonce? */
export function agentLaunchAuthenticated(env: NodeJS.ProcessEnv, readLine: () => string | null): boolean {
  const expected = env[AGENT_NONCE_ENV] ?? "";
  if (!NONCE_RE.test(expected)) return false;
  const got = readLine() ?? "";
  if (!NONCE_RE.test(got)) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Child side, real: the handshake on fd 0. Run ONCE, before `process.stdin` is touched. */
export function authenticateAgentLaunch(): boolean {
  const ok = agentLaunchAuthenticated(process.env, () => readLineSync((b) => readSync(0, b, 0, 1, null)));
  delete process.env[AGENT_NONCE_ENV];
  return ok;
}
