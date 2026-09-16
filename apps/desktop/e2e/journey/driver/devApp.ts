import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { DESKTOP_DIR, MAIN_LOG } from "./paths";
import { tailLog } from "./tailLog";
import { BRAND } from "@openmasq/branding";

/**
 * The DEV app (`electron-vite dev`), driven via CDP. The only mode that talks to a LOCAL
 * environment, as a consequence: URLs are BAKED at build time and the runtime switch takes
 * an ENUMERATED name only, so a built binary cannot be pointed at localhost; the dev server
 * applies `.env.development` and the dev CSP. CDP rather than `electron.launch` because
 * `electron-vite` is what launches Electron: Playwright can only ATTACH.
 */
export interface DevApp {
  page: Page;
  /** TRUE if we attached to an app we didn't launch: the report MUST say so, the
   *  environment is the launcher's. */
  attache: boolean;
  /** What the main process writes; replays what was written BEFORE the subscription. */
  onLog: (note: (d: unknown) => void) => void;
  close: () => Promise<void>;
}

/** How many startup lines we keep to explain an attach failure. */
const TAIL_LINES = 40;

const BIN = resolve(DESKTOP_DIR, "../../node_modules/.bin/electron-vite");
/** The INSTALLED app (mode `installed`); `OPENMASQ_INSTALLED_APP` overrides the path. */
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
    // A dead child will never open the port: fail now, the cause is on stderr.
    const end = dead();
    if (end) throw new Error(`l'app s'est arrêtée avant d'ouvrir son port CDP (${end})`);
    if (Date.now() > endAt) throw new Error("electron-vite dev n'a pas ouvert son port CDP");
    await sleep(500);
  }
}

/**
 * The APP's window among the CDP targets (dev server or `file://`), filtered by ORIGIN
 * since `devtools://` or `about:blank` pages coexist. ⚠️ Says NOTHING about the end of the
 * URL: Chromium normalizes the dev root to a trailing `/`.
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

/** Does the CDP port answer ALREADY? A single attempt. */
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
 * ATTACH to an already-launched app. On a machine where the agent session is itself
 * confined it is the ONLY path: macOS refuses a nested `sandbox_apply`, so an app launched
 * FROM a confined session dies with no renderer. Attached, the driver holds no pipe (main's
 * output reaches it through `.journey/main.log`) and `close()` kills NOTHING.
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
  /** `installed`: the PACKAGED binary. Chromium flags (the CDP port) stay accepted; only
   *  the NODE inspector is fused off. */
  mode: "dev" | "installed" = "dev",
): Promise<DevApp> {
  // An app already on the port: attach, never spawn a second Electron on a taken port.
  if (await portOpen(CDP_PORT)) return attachFile();
  const [bin, args] =
    mode === "installed"
      ? [INSTALLED_BIN, [`--remote-debugging-port=${CDP_PORT}`]]
      : [BIN, ["dev", `--remoteDebuggingPort=${CDP_PORT}`]];
  const child: ChildProcess = spawn(bin, args, {
    cwd: DESKTOP_DIR,
    env: { ...env, ...(mode === "installed" ? {} : { NODE_ENV: "development" }) },
    // SEPARATE process group: `electron-vite` launches Electron as a CHILD.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // ⚠️ Wire the streams RIGHT AWAY: what the app says while dying comes out BEFORE the
  // CDP port exists, and unread pipes fill up until they block the child.
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
    // Kill the group: a child left alive keeps the CDP port and masks the next failure.
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
      // Detach BEFORE killing, or Playwright's error masks the real one.
      await browser?.close().catch(() => {});
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    },
  };
}
