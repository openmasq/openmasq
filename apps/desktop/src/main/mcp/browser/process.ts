import { app, type Rectangle } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { helperSpawnArgs } from "../../appEntry";
import { startCdpBroker, probeCdpPipe, type CdpBroker } from "./cdpBroker";
import { showHaloAt, hideHalo, destroyHalo } from "./haloOverlay";
import { reportMainError } from "../../runtime/errorReport";
import { isAppQuitting } from "../../runtime/quitState";

// ── Parent-side manager for the isolated agent-browser process ───────────────
// Spawns the SAME app binary in agent mode (OPENMASQ_AGENT_BROWSER=1 → runAgentBrowserMain),
// reads its CDP endpoint from stdout, controls its window over stdin. The child's CDP
// exposes ONLY agent pages, never the app's UI. See agentMain.ts.

let child: ChildProcess | null = null;
let endpoint: string | null = null;
let starting: Promise<string> | null = null;
// Set only in PIPE mode: the loopback ws broker fronting the child's CDP pipe.
let broker: CdpBroker | null = null;

// Resolves once the child has reported its FIRST tab. @playwright/mcp connects the
// instant `startAgentBrowser` returns; with ZERO tabs it calls `Target.createTarget`,
// which Electron does not support, and never recovers (no `targetCreated` for a later
// tab). Armed per spawn; fail-open on a timeout.
const FIRST_TAB_TIMEOUT_MS = 6000;
let firstTabResolve: (() => void) | null = null;
function armFirstTab(): Promise<void> {
  return new Promise<void>((res) => {
    firstTabResolve = res;
  });
}
/** Called from the stdout listener on the first non-empty AGENT_TABS report. */
function signalFirstTab(): void {
  const r = firstTabResolve;
  firstTabResolve = null;
  r?.();
}

// The agent window is `alwaysOnTop`, so it would float above NATIVE OS dialogs, which the
// renderer's rAF loop cannot know about. `visible` is the renderer's intent, `suspend`
// counts open native dialogs; while suspended the window is force-hidden.
let visible = false;
let suspend = 0;

// The model is DRIVING right now (the renderer's `automating` window) — drives the halo.
let driving = false;
// App-level focus: the overlay hides whenever the app isn't FRONTMOST. Frontmost = the MAIN
// window is focused OR the agent-browser window is (its focus arrives over stdout as
// `AGENT_FOCUS`, it lives in the child process). Start focused.
let mainFocused = true;
let browserFocused = false;
// The last SCREEN rect the renderer pinned the browser to — reused to place the halo overlay.
let lastBounds: Rectangle | null = null;
// What we last told the child, so we don't spam show/hide each frame.
let sentVisible = false;

// The DEBOUNCED frontmost state. Switching focus between the app's two windows (separate
// processes) fires the old `blur` BEFORE the new `focus`; read live, that gap flashes the
// overlay. A focus LOSS takes effect after a grace window; a GAIN applies immediately.
let appFocusedState = true;
let blurTimer: ReturnType<typeof setTimeout> | null = null;
// Bridges a cross-process blur→focus hand-off; short enough that leaving the app still
// hides immediately.
const APP_BLUR_GRACE_MS = 220;

// Gain → immediate (cancel any pending hide); loss on BOTH windows → deferred by the grace.
function recomputeAppFocus(): void {
  if (mainFocused || browserFocused) {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (!appFocusedState) {
      appFocusedState = true;
      applyVisibility();
    }
    return;
  }
  // Both blurred: could be a hand-off gap, wait before believing it.
  if (blurTimer || !appFocusedState) return;
  blurTimer = setTimeout(() => {
    blurTimer = null;
    if (mainFocused || browserFocused) return; // a focus arrived during the grace
    appFocusedState = false;
    applyVisibility();
  }, APP_BLUR_GRACE_MS);
}

// The renderer WANTS it AND no native dialog is up AND the app is frontmost (debounced).
const effectiveVisible = (): boolean => visible && suspend === 0 && appFocusedState;

// The halo: shown only while DRIVING and the browser is effectively visible.
function applyHalo(): void {
  if (driving && effectiveVisible() && lastBounds) showHaloAt(lastBounds);
  else hideHalo();
}

// Single choke-point: every gate calls THIS instead of sending show/hide directly, so the
// three gates compose.
function applyVisibility(): void {
  const ev = effectiveVisible();
  if (ev !== sentVisible) {
    sentVisible = ev;
    send({ cmd: ev ? "show" : "hide" });
  }
  applyHalo();
}

// The child reports its full TAB list on stdout (`AGENT_TABS [json]`) whenever it changes.
export interface AgentTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  /** The tab the MODEL is driving: the drive indicator follows it, not the active one. */
  agent: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Raster `data:` URL fetched hardened in the child; absent → letter tile. */
  favicon?: string;
}
let tabsReporter: ((tabs: AgentTab[]) => void) | null = null;
export function setAgentTabsReporter(cb: ((tabs: AgentTab[]) => void) | null): void {
  tabsReporter = cb;
}

// App shortcuts the agent window intercepts (it has OS keyboard focus), e.g. ⌘K.
let shortcutReporter: ((name: string) => void) | null = null;
export function setAgentShortcutReporter(cb: ((name: string) => void) | null): void {
  shortcutReporter = cb;
}

// A PERSISTENT stdout line reader. Coexists with the one-shot ready readers: each keeps
// its own buffer and matches its own prefix.
function attachPageListener(proc: ChildProcess): void {
  let buf = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const sc = line.match(/^AGENT_SHORTCUT (\S+)$/);
      if (sc) {
        shortcutReporter?.(sc[1]);
        continue;
      }
      // The child's browser window gained/lost OS focus — part of "is the app frontmost?".
      const fo = line.match(/^AGENT_FOCUS ([01])$/);
      if (fo) {
        browserFocused = fo[1] === "1";
        recomputeAppFocus();
        continue;
      }
      const m = line.match(/^AGENT_TABS (.+)$/);
      if (!m) continue;
      // Unblock `startAgentBrowser` as soon as a page target exists, independently of
      // the renderer's `tabsReporter` (unset when no panel is open).
      try {
        const arr = JSON.parse(m[1]) as unknown[];
        if (Array.isArray(arr) && arr.length > 0) signalFirstTab();
      } catch {
        /* fall through to the reporter parse below */
      }
      if (!tabsReporter) continue;
      try {
        const raw = JSON.parse(m[1]) as Array<Partial<AgentTab>>;
        tabsReporter(
          raw.map((t) => ({
            id: String(t.id ?? ""),
            url: String(t.url ?? ""),
            title: String(t.title ?? ""),
            active: !!t.active,
            agent: !!t.agent,
            loading: !!t.loading,
            canGoBack: !!t.canGoBack,
            canGoForward: !!t.canGoForward,
            // The IPC boundary re-validates the shape the child already vetted.
            favicon:
              typeof t.favicon === "string" && t.favicon.startsWith("data:image/")
                ? t.favicon
                : undefined,
          })),
        );
      } catch {
        /* ignore a malformed line */
      }
    }
  });
}

function agentUserData(): string {
  return join(app.getPath("userData"), "agent-browser");
}

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENMASQ_AGENT_BROWSER: "1",
    OPENMASQ_AGENT_USERDATA: agentUserData(),
    // Agent mode never loads the renderer: drop the dev-server URL.
    ELECTRON_RENDERER_URL: "",
  };
}

function spawnArgs(): string[] {
  // The entry path comes from `app.getAppPath()` and NOWHERE else (`../../appEntry.ts`).
  return helperSpawnArgs();
}

function closeBroker(): void {
  if (broker) {
    try {
      broker.close();
    } catch {
      /* noop */
    }
    broker = null;
  }
}

// PREFERRED transport: `--remote-debugging-pipe` (CDP over inherited fds 3/4, NO TCP
// port), fronted by a secret-gated loopback ws broker for @playwright/mcp (TCP-only).
function spawnChildPipe(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.error(`[agent] spawning (pipe): ${process.execPath} ${spawnArgs().join(" ")}`);
    const proc = spawn(process.execPath, spawnArgs(), {
      env: { ...baseEnv(), OPENMASQ_AGENT_CDP_PIPE: "1" },
      // 0/1/2 = control/ready line/stderr; 3/4 = the CDP pipe Chromium reads / writes.
      stdio: ["pipe", "pipe", "inherit", "pipe", "pipe"],
    });
    child = proc;
    attachPageListener(proc);
    let settled = false;

    let out = "";
    const onData = (chunk: Buffer) => {
      out += chunk.toString();
      if (!/AGENT_PIPE_READY/.test(out)) return;
      proc.stdout?.off("data", onData);
      const pipeWrite = proc.stdio[3] as unknown as NodeJS.WritableStream | null;
      const pipeRead = proc.stdio[4] as unknown as NodeJS.ReadableStream | null;
      if (!pipeWrite || !pipeRead) {
        reject(new Error("agent(pipe): fds 3/4 missing"));
        return;
      }
      startCdpBroker(pipeWrite, pipeRead, `Chrome/${process.versions.chrome}`)
        .then(async (b) => {
          broker = b;
          // Confirm CDP actually rides the pipe BEFORE committing, so the fallback
          // happens now rather than when @playwright/mcp can't connect.
          await probeCdpPipe(b.endpoint);
          endpoint = b.endpoint;
          settled = true;
          console.error("[agent] ready (pipe): loopback ws broker, no TCP CDP port");
          resolve(b.endpoint);
        })
        .catch(reject);
    };
    proc.stdout?.on("data", onData);
    proc.on("exit", (code) => {
      if (child === proc) {
        // A death MID-SESSION is reported by name.
        if (settled && !isAppQuitting()) {
          reportMainError("browser", `agent-exit-${code ?? "?"}`, new Error(`agent browser (pipe) mort (code ${code})`));
        }
        child = null;
        endpoint = null;
        starting = null;
        closeBroker();
      }
      if (!settled) reject(new Error(`agent(pipe) exited before ready (code ${code})`));
    });
    proc.on("error", reject);
    setTimeout(() => { if (!settled) reject(new Error("agent(pipe) start timeout")); }, 20000);
  });
}

// FALLBACK transport: a random loopback CDP port published by the child on stdout.
// Unauthenticated (CDP has none) — mitigated only by 127.0.0.1 + the random port.
function spawnChildPort(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.error(`[agent] spawning (port): ${process.execPath} ${spawnArgs().join(" ")}`);
    const proc = spawn(process.execPath, spawnArgs(), {
      env: baseEnv(),
      // The child's stderr reaches the parent terminal so boot failures are visible.
      stdio: ["pipe", "pipe", "inherit"],
    });
    child = proc;
    attachPageListener(proc);

    let out = "";
    const onData = (chunk: Buffer) => {
      out += chunk.toString();
      const m = out.match(/AGENT_CDP (\S+)/);
      if (m) {
        proc.stdout?.off("data", onData);
        endpoint = m[1];
        console.error(`[agent] ready: ${endpoint}`);
        resolve(endpoint);
      } else if (/AGENT_CDP_ERROR/.test(out)) {
        proc.stdout?.off("data", onData);
        reject(new Error("agent browser failed to open CDP endpoint"));
      }
    };
    proc.stdout?.on("data", onData);
    proc.on("exit", (code) => {
      if (child === proc) {
        // Same rule as the pipe transport: a death mid-session gets reported.
        if (endpoint && !isAppQuitting()) {
          reportMainError("browser", `agent-exit-${code ?? "?"}`, new Error(`agent browser (port) mort (code ${code})`));
        }
        child = null;
        endpoint = null;
        starting = null;
      }
      if (!endpoint) reject(new Error(`agent browser process exited before ready (code ${code})`));
    });
    proc.on("error", (err) => reject(err));
    setTimeout(() => { if (!endpoint) reject(new Error("agent browser start timeout")); }, 25000);
  });
}

// Pipe transport first; on ANY failure fall back to the TCP port (Windows fd handling
// is the likely fallback path).
async function spawnChild(): Promise<string> {
  try {
    return await spawnChildPipe();
  } catch (err) {
    // SECURITY: the port fallback exposes an UNAUTHENTICATED loopback CDP endpoint that
    // any same-user process can drive. Logged prominently.
    console.error(
      "[agent] SECURITY: pipe CDP unavailable → falling back to an UNAUTHENTICATED loopback CDP port:",
      err instanceof Error ? err.message : err,
    );
    const dead = child;
    child = null;
    endpoint = null;
    closeBroker();
    if (dead) {
      try {
        dead.kill("SIGTERM");
      } catch {
        /* noop */
      }
    }
    return spawnChildPort();
  }
}

/** Start the agent browser (idempotent) and resolve its CDP endpoint once the child has a
 *  live page target (see `signalFirstTab`). */
export function startAgentBrowser(): Promise<string> {
  if (endpoint && child) return Promise.resolve(endpoint); // already up → has ≥1 tab
  if (starting) return starting;
  starting = (async () => {
    const tabReady = armFirstTab(); // arm BEFORE spawn so no report is missed
    const ep = await spawnChild();
    // Fail OPEN on a timeout: the recoverable-error retry (`server/callTool.ts`) is the
    // backstop.
    await Promise.race([
      tabReady,
      new Promise<void>((res) => setTimeout(res, FIRST_TAB_TIMEOUT_MS)),
    ]);
    return ep;
  })();
  return starting;
}

export function agentBrowserEndpoint(): string | null {
  return endpoint;
}

export function agentBrowserRunning(): boolean {
  return !!child && !!endpoint;
}

function send(cmd: object): void {
  child?.stdin?.write(JSON.stringify(cmd) + "\n");
}

export function agentNavigate(url: string, tabId?: string): void {
  send({ cmd: "navigate", url, tabId });
}
export function agentTabNew(url?: string): void {
  send({ cmd: "tab-new", url });
}
export function agentTabSelect(tabId: string): void {
  send({ cmd: "tab-select", tabId });
}
export function agentTabClose(tabId: string): void {
  send({ cmd: "tab-close", tabId });
}
export function agentBack(): void {
  send({ cmd: "back" });
}
export function agentForward(): void {
  send({ cmd: "forward" });
}
export function agentShow(): void {
  visible = true;
  applyVisibility();
}
export function agentHide(): void {
  visible = false;
  applyVisibility();
}
/** Toggles the halo AND tells the child, which keeps a DEDICATED tab for the model. */
export function setAgentDriving(on: boolean): void {
  driving = on;
  send({ cmd: "driving", on });
  applyHalo();
}
/** The MAIN window's focus, combined with the child's to decide frontmost. */
export function setAppMainFocused(on: boolean): void {
  mainFocused = on;
  recomputeAppFocus();
}

/** Hide the agent window for the duration of a NATIVE dialog. Re-entrant; `agentShow`
 *  requests arriving mid-dialog are held until the last dialog closes. */
export async function withAgentBrowserHidden<T>(fn: () => Promise<T>): Promise<T> {
  suspend++;
  applyVisibility();
  try {
    return await fn();
  } finally {
    suspend = Math.max(0, suspend - 1);
    applyVisibility();
  }
}
export function agentBounds(bounds: Rectangle): void {
  lastBounds = bounds;
  send({ cmd: "bounds", bounds });
  applyHalo(); // keep the halo pinned to the browser as it moves / resizes
}

/**
 * Stop the agent browser; resolves ONLY once the child has exited. The update flow awaits
 * it before `quitAndInstall`: Squirrel.Mac aborts the swap while it sees >1 instance of the
 * bundle. Escalates stdin-close → SIGTERM → SIGKILL.
 */
export function stopAgentBrowser(): Promise<void> {
  const proc = child;
  child = null;
  endpoint = null;
  starting = null;
  closeBroker();
  // Reset the gates so a fresh spawn starts hidden and re-derives visibility.
  destroyHalo();
  driving = false;
  browserFocused = false;
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  appFocusedState = true;
  sentVisible = false;
  lastBounds = null;
  if (!proc) return Promise.resolve();
  // Hide FIRST so the alwaysOnTop window doesn't linger while the child exits.
  try { proc.stdin?.write(JSON.stringify({ cmd: "hide" }) + "\n"); } catch { /* noop */ }
  try { proc.stdin?.end(); } catch { /* noop */ }
  return new Promise<void>((resolve) => {
    const term = setTimeout(() => { try { proc.kill("SIGTERM"); } catch { /* noop */ } }, 800);
    const hard = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* noop */ } resolve(); }, 3000);
    proc.once("exit", () => { clearTimeout(term); clearTimeout(hard); resolve(); });
  });
}
