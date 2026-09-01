import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { DESKTOP_DIR, MAIN_LOG } from "./paths";
import { tailLog } from "./tailLog";
import { BRAND } from "@openmasq/branding";

/**
 * The DEV app — `electron-vite dev`, driven via CDP.
 *
 * ⚠️ **This is the only mode that talks to the LOCAL environment, and it's not a setting:
 * it's a consequence.** The renderer's URLs (`appEnv.ts`) come from `import.meta.env`,
 * so they're BAKED at build time; the runtime switch, meanwhile, only accepts an
 * ENUMERATED name (`src/environments/`: production | staging — deliberately, a free URL in a
 * switch would amount to arbitrary egress). A built binary therefore CANNOT be pointed at
 * localhost after the fact: the only path is the dev server, which applies
 * `.env.development` at serve time. The same mode gives the dev CSP for free
 * (a Vite plugin injects `http://localhost:*` into it), which a build would otherwise force you to patch by
 * hand in `out/renderer/index.html` — and that patch is lost on the next rebuild.
 *
 * Why CDP rather than `electron.launch`: it's `electron-vite` that launches Electron
 * (it compiles main/preload in dev mode and serves the renderer), so Playwright can only
 * ATTACH. The driver loses nothing by it — no command needs the Electron handle,
 * they all go through the page — and we gain not rebuilding anything between two sessions.
 */
export interface DevApp {
  page: Page;
  /** TRUE if we attached to an app we didn't launch (see `attacheOuSpawn`).
   *  The agent MUST say so in its report: the environment is that of the person
   *  who launched the app, not the one the driver would have set up. */
  attache: boolean;
  /** What the main process writes (`[mcp:raw]` on stdout, exceptions on stderr).
   *  Replays what was written BEFORE the subscription: startup talks while the
   *  driver is still waiting for the CDP port. */
  onLog: (note: (d: unknown) => void) => void;
  close: () => Promise<void>;
}

/** How many startup lines we keep to explain an attach failure. */
const TAIL_LINES = 40;

const BIN = resolve(DESKTOP_DIR, "../../node_modules/.bin/electron-vite");
/** The INSTALLED app (mode `installed`) — the packaged binary, as a user
 *  has it on their machine. Overridable via `OPENMASQ_INSTALLED_APP` (another path,
 *  another machine). */
const INSTALLED_BIN =
  process.env.OPENMASQ_INSTALLED_APP ?? `/Applications/${BRAND.name}.app/Contents/MacOS/${BRAND.name}`;
/** Fixed CDP port: only one driver session at a time (one daemon, one app). */
const CDP_PORT = 9333;
/** The first startup compiles main + preload: it's slow, but it's still dev. */
const READY_TIMEOUT_MS = 180_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForCdp(port: number, endAt: number, dead: () => string | null): Promise<string> {
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return `http://127.0.0.1:${port}`;
    } catch {
      /* not there yet */
    }
    // A child already dead will never open the port: waiting the full 180 s only
    // moves the operator further from the cause, which was just written to stderr.
    const end = dead();
    if (end) throw new Error(`l'app s'est arrêtée avant d'ouvrir son port CDP (${end})`);
    if (Date.now() > endAt) throw new Error("electron-vite dev n'a pas ouvert son port CDP");
    await sleep(500);
  }
}

/**
 * The APP's window among the CDP targets. In dev it's the page served by the
 * local server; packaged, the renderer lives at `file://…/index.html`. A `devtools://` or
 * `about:blank` page can exist alongside it — hence a filter by ORIGIN, allow-listed.
 *
 * ⚠️ The filter must say NOTHING about the end of the URL. An earlier version required a
 * last character that wasn't `/`, so the dev server's root (`http://localhost:5173/`,
 * the form Chromium NORMALIZES to) never matched: the driver would wait 180 s
 * then announce "no app window" in front of a perfectly open app.
 */
const APP_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)|file:\/\/)/;

async function waitForPage(browser: Browser, endAt: number): Promise<Page> {
  for (;;) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (APP_ORIGIN.test(p.url())) return p;
      }
    }
    if (Date.now() > endAt) throw new Error("aucune fenêtre d'app (serveur de dév ou file://)");
    await sleep(500);
  }
}

/** Does the CDP port answer ALREADY? A single attempt — we don't want to wait here. */
async function portOpen(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * ATTACH to an already-launched app, rather than launching it.
 *
 * ⚠️ **This isn't a shortcut: on a machine where the agent session is itself
 * confined, it's the ONLY path.** Chromium creates a sandbox per renderer / GPU /
 * network service, and macOS refuses `sandbox_apply` to a process already under seatbelt: an
 * app launched FROM a confined session opens its CDP port then dies with no renderer
 * (`GPU process exit_code=6`). Launched from a normal terminal, it keeps its confinement
 * INTACT — nothing is taken away from it, only WHO brought it into being changes.
 *
 * What attached mode costs, and what you need to know: the driver holds no pipe, so
 * the main process's output (`[mcp:raw]`, exceptions) only reaches it through
 * `.journey/main.log` — hence the redirection in the launch command. And `close()`
 * kills NOTHING: we don't close someone else's app.
 */
async function attachFile(): Promise<DevApp> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const page = await waitForPage(browser, Date.now() + 30_000);
  const stops: Array<() => void> = [];
  return {
    page,
    attache: true,
    onLog: (note) => stops.push(tailLog(MAIN_LOG, note)),
    close: async () => {
      for (const a of stops) a();
      await browser.close().catch(() => {});
    },
  };
}

export async function startDevApp(
  env: Record<string, string>,
  /** `installed`: drive the PACKAGED binary (INSTALLED_BIN) rather than the dev
   *  server — the app as a user has it installed, signing chains and
   *  runtime included. Chromium flags (including the CDP port) remain accepted by a
   *  packaged build; only the NODE inspector is fused off. */
  mode: "dev" | "installed" = "dev",
): Promise<DevApp> {
  // An app is already there on the port: attach to it. Spawning on top would give a second
  // Electron that fails on the taken port — and that has already led to diagnosing "port
  // in use" where the cause was something else entirely.
  if (await portOpen(CDP_PORT)) return attachFile();
  const [bin, args] =
    mode === "installed"
      ? [INSTALLED_BIN, [`--remote-debugging-port=${CDP_PORT}`]]
      : [BIN, ["dev", `--remoteDebuggingPort=${CDP_PORT}`]];
  const child: ChildProcess = spawn(bin, args, {
    cwd: DESKTOP_DIR,
    env: { ...env, ...(mode === "installed" ? {} : { NODE_ENV: "development" }) },
    // SEPARATE process group: `electron-vite` launches Electron as a CHILD, so killing
    // the only known PID would leave the app alive (and the CDP port taken on the next start).
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // ⚠️ Wire up the streams RIGHT AWAY, not after attaching. What the app says while dying
  // ("sandbox initialization failed", a missing native module, a port already in use) comes out
  // BEFORE the CDP port exists: subscribed after the fact, the operator only saw
  // "socket hang up" and looked for the cause in the wrong place. With nobody reading the
  // pipes, they'd also fill up until blocking the child.
  const tail: string[] = [];
  const subscribers: Array<(d: unknown) => void> = [];
  const captureOutput = (d: unknown) => {
    for (const l of String(d).split("\n")) if (l.trim()) tail.push(l.trimEnd());
    if (tail.length > TAIL_LINES) tail.splice(0, tail.length - TAIL_LINES);
    for (const note of subscribers) note(d);
  };
  child.stdout?.on("data", captureOutput);
  child.stderr?.on("data", captureOutput);
  let dead: string | null = null;
  child.on("exit", (code, signal) => {
    dead = signal ? `signal ${signal}` : `code ${code}`;
  });

  const endAt = Date.now() + READY_TIMEOUT_MS;
  let page: Page;
  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(await waitForCdp(CDP_PORT, endAt, () => dead));
    page = await waitForPage(browser, endAt);
  } catch (e) {
    // Kill the group: a child left alive keeps the CDP port, and the next attempt
    // fails "differently" — which leads to diagnosing a port-in-use issue instead of the
    // real cause.
    await browser?.close().catch(() => {});
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already dead */
    }
    const output = tail.length ? `\n--- dernières lignes de ${bin} ---\n${tail.join("\n")}` : "";
    throw new Error(`${e instanceof Error ? e.message : String(e)}${output}`);
  }
  return {
    page,
    attache: false,
    onLog: (note) => {
      for (const l of tail) note(l);
      subscribers.push(note);
    },
    close: async () => {
      // Detach BEFORE killing: closing the CDP browser doesn't close the app, and killing
      // the app while Playwright is talking to it produces an error that masks the real one.
      await browser?.close().catch(() => {});
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    },
  };
}
