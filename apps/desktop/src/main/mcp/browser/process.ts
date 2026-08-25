import { app, type Rectangle } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { helperSpawnArgs } from "../../appEntry";
import { startCdpBroker, probeCdpPipe, type CdpBroker } from "./cdpBroker";
import { showHaloAt, hideHalo, destroyHalo } from "./haloOverlay";
import { reportMainError } from "../../runtime/errorReport";
import { isAppQuitting } from "../../runtime/quitState";

// ── Parent-side manager for the isolated agent-browser process ───────────────
// Spawns the SAME app binary re-entered in agent mode (OPENMASQ_AGENT_BROWSER=1
// → runAgentBrowserMain), reads its CDP endpoint from stdout, and controls its
// window over stdin. The child's CDP exposes ONLY the agent page, so
// @playwright/mcp (pointed here) targets it deterministically and can never reach
// the app's own UI. See agentMain.ts.

let child: ChildProcess | null = null;
let endpoint: string | null = null;
let starting: Promise<string> | null = null;
// Set only in PIPE mode: the loopback ws broker fronting the child's CDP pipe.
let broker: CdpBroker | null = null;

// Resolves once the freshly-spawned child has reported its FIRST tab (its `about:blank`
// page target exists). @playwright/mcp connects to the CDP endpoint the instant
// `startAgentBrowser` returns; if it connects while the child still has ZERO tabs, its
// `browser_navigate` calls `Target.createTarget` — which Electron does NOT support — and
// every navigation fails ("Protocol error (Target.createTarget): Not supported"). Electron
// also doesn't emit `targetCreated` for a tab opened AFTER the connect, so pwmcp never
// recovers on its own. Gating the endpoint on the first tab makes pwmcp always attach to a
// live page instead of trying to create one. Armed per spawn; fail-open on a timeout.
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

// The agent window is `alwaysOnTop`, so it floats above NATIVE OS dialogs too (a
// file picker, a message box) — which then can't be used. The renderer hides it for
// DOM modals, but a native dialog isn't a DOM node, and the renderer's rAF loop keeps
// re-issuing `browser:show` every frame. So visibility is tracked here and SUSPENDED
// around native dialogs: `visible` is the renderer's intent, `suspend` counts open
// native dialogs; while suspended, `show` requests are remembered but not sent, and
// the window is force-hidden — so the dialog is on top and re-shows only after it closes.
let visible = false;
let suspend = 0;

// The model is DRIVING right now (the renderer's `automating` window) — drives the halo.
let driving = false;
// App-level focus. The agent window is `alwaysOnTop`, so it also floats over OTHER apps —
// which reads as "another app slid UNDER this one container". Fix: hide the overlay whenever
// the app isn't the FRONTMOST app. "the app is frontmost" = its MAIN window is focused OR the
// agent-browser window is focused (an app window living in the CHILD process, so its focus
// arrives over stdout as `AGENT_FOCUS`). Start focused.
let mainFocused = true;
let browserFocused = false;
// The last SCREEN rect the renderer pinned the browser to — reused to place the halo overlay.
let lastBounds: Rectangle | null = null;
// What we last told the child, so we don't spam show/hide each frame.
let sentVisible = false;

// The DEBOUNCED app-frontmost state (what the visibility gate actually reads). Raw
// `mainFocused || browserFocused` is NOT usable directly: switching focus BETWEEN the app's
// two windows (the main window ⇄ the child browser window, which live in SEPARATE processes,
// so the child's focus travels over stdout with IPC latency) fires the OLD window's `blur`
// BEFORE the NEW window's `focus` — a brief window where neither is focused. Reading that gap
// live drops `effectiveVisible` to false → hide, then the focus arrives → show: the overlay
// FLASHES on every hand-off, and continuously while the model drives and the user interacts
// (the reported "s'ouvre et se referme tout le temps"). So a focus LOSS only takes effect
// after a short grace window; a focus GAIN applies immediately and cancels the pending hide.
let appFocusedState = true;
let blurTimer: ReturnType<typeof setTimeout> | null = null;
// Wide enough to bridge a cross-process blur→focus hand-off (the child's AGENT_FOCUS is a
// stdout round-trip); short enough that hiding when the user genuinely leaves the app to
// ANOTHER application still feels immediate.
const APP_BLUR_GRACE_MS = 220;

// Recompute the debounced frontmost state from the two raw inputs and apply on a CHANGE.
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
  // Both windows are blurred — could be a hand-off gap, so wait before believing it.
  if (blurTimer || !appFocusedState) return;
  blurTimer = setTimeout(() => {
    blurTimer = null;
    if (mainFocused || browserFocused) return; // a focus arrived during the grace
    appFocusedState = false;
    applyVisibility();
  }, APP_BLUR_GRACE_MS);
}

// Effective visibility = the renderer WANTS it (`visible`) AND no native dialog is up
// (`suspend`) AND the app is frontmost (`appFocusedState`, debounced). That last gate is what
// stops the alwaysOnTop window (and its halo) floating over another application.
const effectiveVisible = (): boolean => visible && suspend === 0 && appFocusedState;

// The halo overlay tracks the browser: shown only while DRIVING and the browser itself is
// effectively visible, pinned to its last screen rect.
function applyHalo(): void {
  if (driving && effectiveVisible() && lastBounds) showHaloAt(lastBounds);
  else hideHalo();
}

// Single choke-point: recompute effective visibility, push show/hide to the child only on a
// CHANGE, then reconcile the halo. Every gate (agentShow/Hide, suspend, focus) calls THIS
// instead of sending show/hide directly, so all three gates compose correctly.
function applyVisibility(): void {
  const ev = effectiveVisible();
  if (ev !== sentVisible) {
    sentVisible = ev;
    send({ cmd: ev ? "show" : "hide" });
  }
  applyHalo();
}

// The child reports its full TAB list on stdout (`AGENT_TABS [json]`) whenever it
// changes — a tab opened/closed/selected, or any tab navigated/retitled — by the user,
// a page's `window.open`, or the MODEL over CDP. The panel mirrors it 1:1.
export interface AgentTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
  /** The tab the MODEL is currently driving (its dedicated `agentTabId`) — drives the
   *  drive indicator, which must follow the PILOTED tab, not the visible/active one. */
  agent: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The site's favicon as a raster `data:` URL (fetched hardened in the child), else
   *  absent → the rail shows its letter tile. */
  favicon?: string;
}
let tabsReporter: ((tabs: AgentTab[]) => void) | null = null;
export function setAgentTabsReporter(cb: ((tabs: AgentTab[]) => void) | null): void {
  tabsReporter = cb;
}

// App shortcuts the agent window intercepts (it has OS keyboard focus) and forwards to
// the renderer — e.g. ⌘K, which would otherwise never reach the app while browsing.
let shortcutReporter: ((name: string) => void) | null = null;
export function setAgentShortcutReporter(cb: ((name: string) => void) | null): void {
  shortcutReporter = cb;
}

// A PERSISTENT stdout line reader for `AGENT_PAGE` reports. Coexists with the one-shot
// ready/endpoint readers (a 'data' event fans out to every listener); each keeps its own
// line buffer, and each only matches its own prefix, so they don't interfere.
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
      // Unblock `startAgentBrowser` as soon as a page target exists — BEFORE (and
      // independently of) the renderer's `tabsReporter`, which is unset on the model-only
      // path where no panel is open. Guard on a non-empty list so an empty report doesn't
      // signal "ready" with zero tabs.
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
            // Defence in depth: only pass a `data:image/` URL to the renderer (the child
            // already vets it raster-only, but the IPC boundary re-validates the shape).
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
    // Agent mode never loads the renderer — drop the dev-server URL so it can't
    // wait on it.
    ELECTRON_RENDERER_URL: "",
  };
}

function spawnArgs(): string[] {
  // Dev: process.execPath is the electron binary → re-run THIS app in agent mode.
  // Packaged: execPath is the app → the bundled main auto-loads, no arg. Le chemin
  // vient de `app.getAppPath()` et de NULLE PART ailleurs — voir `../../appEntry.ts`
  // pour pourquoi `require.main.filename` (= « electron ») bloquait l'enfant.
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

// PREFERRED transport: Electron `--remote-debugging-pipe` (CDP over inherited fds
// 3/4 — NO TCP port, unreachable by other local processes), fronted by a secret-
// gated loopback ws broker so @playwright/mcp (TCP-only) can still connect. Rejects
// on any failure so `spawnChild` can fall back to the TCP-port transport.
function spawnChildPipe(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.error(`[agent] spawning (pipe): ${process.execPath} ${spawnArgs().join(" ")}`);
    const proc = spawn(process.execPath, spawnArgs(), {
      env: { ...baseEnv(), OPENMASQ_AGENT_CDP_PIPE: "1" },
      // 0/1/2 = stdin(control)/stdout(ready line)/stderr; 3/4 = the CDP pipe Chromium
      // reads (fd3) / writes (fd4) under `--remote-debugging-pipe`.
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
          // Confirm CDP actually rides the pipe (Electron honoured --remote-debugging-
          // pipe) BEFORE we commit — else fall back to the port transport now, not
          // later when @playwright/mcp can't connect.
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
        // Une mort EN COURS DE SESSION était totalement silencieuse (le prochain appel
        // d'outil re-spawne sans un mot) — rapportée nommée désormais (audit 13/08).
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
      // Surface the child's stderr in the parent terminal so boot failures are
      // visible (was swallowed with "ignore").
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
        // Même règle que le transport pipe : la mort en cours de session se rapporte.
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

// Try the hardened pipe transport; on ANY failure fall back to the TCP port so the
// browser feature never regresses (Windows fd handling is the likely fallback path).
async function spawnChild(): Promise<string> {
  try {
    return await spawnChildPipe();
  } catch (err) {
    // SECURITY (audit M-5): the port fallback exposes an UNAUTHENTICATED loopback CDP
    // endpoint (CDP has no auth) — any same-user local process can drive the agent
    // browser (Runtime.evaluate, read its authenticated-SaaS cookies). It's only used
    // when Electron ignores --remote-debugging-pipe; log it prominently.
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

/** Start the agent browser (idempotent) and resolve its CDP endpoint — only ONCE the
 *  child has a live page target, so @playwright/mcp (which connects immediately after)
 *  never hits the zero-tab `Target.createTarget` race (see `signalFirstTab`). */
export function startAgentBrowser(): Promise<string> {
  if (endpoint && child) return Promise.resolve(endpoint); // already up → has ≥1 tab
  if (starting) return starting;
  starting = (async () => {
    const tabReady = armFirstTab(); // arm BEFORE spawn so no report is missed
    const ep = await spawnChild();
    // Wait for the first tab, but fail OPEN on a timeout — the recoverable-error retry
    // (`server/callTool.ts`) is still the backstop, and blocking forever is worse.
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
/** The model started/stopped driving — toggles the drive-halo overlay AND tells the child so
 *  it can keep a DEDICATED tab for the model (the child pins/uses `agentTabId` while driving,
 *  so a user navigation never clobbers the page the model is working on). */
export function setAgentDriving(on: boolean): void {
  driving = on;
  send({ cmd: "driving", on });
  applyHalo();
}
/** The app's MAIN window gained/lost focus. Combined with the child's own window focus to
 *  decide whether the app is frontmost (see `appFocused`) — so the overlay hides when the
 *  user switches to another application. */
export function setAppMainFocused(on: boolean): void {
  mainFocused = on;
  recomputeAppFocus();
}

/**
 * Hide the agent window for the duration of a NATIVE dialog (file/dir picker, message
 * box) and restore its prior visibility after — so an `alwaysOnTop` window never covers
 * the dialog. Re-entrant (nested dialogs count), and `agentShow` requests arriving
 * mid-dialog (the renderer's rAF) are held until the last dialog closes.
 */
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
 * Stop the agent browser (closing our stdin pipe makes the child quit itself). Returns
 * a promise that resolves ONLY once the child process has actually exited — the update
 * flow awaits it before `quitAndInstall`, because this child is a full Electron instance
 * of the SAME app bundle and Squirrel.Mac (ShipIt) aborts the swap while it still sees
 * >1 running instance ("App Still Running Error"). Non-awaiting callers (window close,
 * before-quit) may ignore the promise. Escalates stdin-close → SIGTERM → SIGKILL so a
 * wedged child can't outlive the parent.
 */
export function stopAgentBrowser(): Promise<void> {
  const proc = child;
  child = null;
  endpoint = null;
  starting = null;
  closeBroker();
  // The overlay decorates a window that's going away — tear it down and reset the gates so
  // a fresh spawn starts hidden and re-derives visibility from the renderer.
  destroyHalo();
  driving = false;
  browserFocused = false;
  // Reset the focus debounce so a fresh spawn starts frontmost (the renderer re-derives
  // real visibility) and no stale hide timer fires against the new child.
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  appFocusedState = true;
  sentVisible = false;
  lastBounds = null;
  if (!proc) return Promise.resolve();
  // Hide the window FIRST so it vanishes instantly, then close stdin (→ the child
  // quits) — otherwise the alwaysOnTop window can linger visibly for the moment the
  // child takes to exit.
  try { proc.stdin?.write(JSON.stringify({ cmd: "hide" }) + "\n"); } catch { /* noop */ }
  try { proc.stdin?.end(); } catch { /* noop */ }
  return new Promise<void>((resolve) => {
    const term = setTimeout(() => { try { proc.kill("SIGTERM"); } catch { /* noop */ } }, 800);
    const hard = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* noop */ } resolve(); }, 3000);
    proc.once("exit", () => { clearTimeout(term); clearTimeout(hard); resolve(); });
  });
}
