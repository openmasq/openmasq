import { BrowserWindow } from "electron";
import { DEVTOOLS_PREF } from "../devtools";
import { buildHtml, ALLOW_URL, ALLOW_TOOL_URL, DENY_URL } from "./writeConfirmHtml";
import type { WriteHazard } from "../fs/toolOrders";

/**
 * SECURITY: a MAIN-OWNED write-confirmation surface, neither the app renderer (anything in
 * its DOM, or minted by an IPC it can call, is forgeable by XSS) nor the native OS dialog
 * (product: a branded confirmation).
 *
 * A dedicated, frameless, modal `BrowserWindow` the renderer has no handle to. The page is
 * OUR HTML (a `data:` URL, args escaped), `sandbox:true` + `contextIsolation:true` +
 * `nodeIntegration:false` and NO preload: ZERO Node/IPC capability. The ONLY exit is a click
 * navigating to a sentinel URL intercepted in `will-navigate`. FAIL CLOSED: close, load
 * error or timeout ⇒ REFUSED.
 */

export interface WriteConfirmRequest {
  /** Real tool name, e.g. `gmail__send_email`. */
  toolName: string;
  /** The REAL (un-redacted) args, so the user judges the actual recipient/subject. */
  args: unknown;
  /** `"disable-gate"` asks to turn OFF per-action confirmation for the session;
   *  `"leave-renforce"` asks to leave the Mode renforcé. Same window: DOWNGRADING the
   *  posture must be a real click on a surface the renderer can't script. */
  mode?: "write" | "disable-gate" | "leave-renforce";
  /** The write lands where other tools RUN what is written (`../fs/toolOrders.ts`): the
   *  window says so, shows the path, and offers no memory for the tool. */
  runByTools?: WriteHazard;
}

const TIMEOUT_MS = 2 * 60_000;

/**
 * How long after the window SHOWS an approval is not taken. Whoever drives the model picks
 * the instant this window appears; a click or a key already on its way (the user was typing,
 * double-clicking, pressing Enter in the conversation) must not land as « Autoriser ».
 * Enforced in MAIN, on the navigation: the page stays script-less, and a refusal is always
 * taken at once.
 */
export const ARM_MS = 500;

/** What a navigation of the confirmation page means. `"stay"`: cancelled, nothing decided;
 *  `"pass"`: the page's own `data:` document. Pure, so the arming rule is tested without a window. */
export function sentinelExit(url: string, armed: boolean): WriteConfirmOutcome | "stay" | "pass" {
  // ⚠️ ALLOW_TOOL_URL shares the ALLOW_URL prefix: it MUST be tested first.
  if (url.startsWith(ALLOW_TOOL_URL)) return armed ? "allow-tool" : "stay";
  if (url.startsWith(ALLOW_URL)) return armed ? true : "stay";
  if (url.startsWith(DENY_URL)) return false;
  return url.startsWith("data:") ? "pass" : "stay";
}

/** One-shot approval, approval that ALSO remembers the tool for the session, or refusal.
 *  `boolean` stays in the union so test stubs (`async () => true`) stay valid. */
export type WriteConfirmOutcome = boolean | "allow-tool";

/** Injectable so the gate is unit-testable without a real window. */
let impl: (req: WriteConfirmRequest) => Promise<WriteConfirmOutcome> = confirmInWindow;

/** Truthy ONLY on an explicit approval (fail closed). `"allow-tool"` also remembers the
 *  tool for the session; recorded HERE so the memory is armed only by a real click. */
export async function confirmWrite(req: WriteConfirmRequest): Promise<boolean> {
  const outcome = await impl(req);
  // never remembered for a write other tools run: each one is its own decision
  if (outcome === "allow-tool" && req.toolName && !req.runByTools) sessionAllowedTools.add(req.toolName);
  return outcome === true || outcome === "allow-tool";
}

// ── Per-tool session memory ─────────────────────────────────────────────────────────────
// Armed ONLY by the click INSIDE the window; keyed by the REAL tool name; in-memory,
// resets on restart (fail-safe default).
const sessionAllowedTools = new Set<string>();

/** Whether this exact tool was session-approved on the main-owned window. */
export function isToolWriteApproved(realName: string): boolean {
  return sessionAllowedTools.has(realName);
}

// ── Session auto-approve ────────────────────────────────────────────────────────────────
// Turned ON only through the SAME un-spoofable window (a renderer XSS can call the IPC but
// can't click). In-memory: RESETS to protected on restart; disabling never prompts.
let sessionAutoApprove = false;

/** Whether per-action write confirmation is currently auto-approved for this session. */
export function isWriteAutoApproved(): boolean {
  return sessionAutoApprove;
}

/** Enabling REQUIRES an approval on the main-owned window; returns the RESULTING state so
 *  the renderer reflects reality. */
export async function setWriteAutoApprove(enable: boolean): Promise<boolean> {
  if (!enable) {
    sessionAutoApprove = false;
    return false;
  }
  if (sessionAutoApprove) return true;
  // Strictly `true`: nothing else may arm the GLOBAL flag.
  sessionAutoApprove = (await impl({ toolName: "", args: undefined, mode: "disable-gate" })) === true;
  return sessionAutoApprove;
}

/** Test seam: stub the confirmation (e.g. always-allow / always-deny / spy). */
export function __setWriteConfirmImpl(fn: (req: WriteConfirmRequest) => Promise<WriteConfirmOutcome>): void {
  impl = fn;
}
export function __resetWriteConfirmImpl(): void {
  impl = confirmInWindow;
  sessionAutoApprove = false;
  sessionAllowedTools.clear();
}

function confirmInWindow(req: WriteConfirmRequest): Promise<WriteConfirmOutcome> {
  return new Promise<WriteConfirmOutcome>((resolve) => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
    let win: BrowserWindow | null = null;
    let settled = false;
    const timer = setTimeout(() => finish(false), TIMEOUT_MS); // fail closed: no answer ⇒ refuse
    const finish = (ok: WriteConfirmOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const w = win;
      win = null;
      try {
        w?.close();
      } catch {
        /* already gone */
      }
      resolve(ok);
    };
    try {
      win = new BrowserWindow({
        parent,
        modal: !!parent,
        frame: false,
        width: 460,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        show: false,
        title: "Confirmation",
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, ...DEVTOOLS_PREF },
      });
      win.setMenuBarVisibility(false);
      // Deny ANY child window / popup from the confirmation page.
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      // The ONLY way out: a click navigating to a sentinel URL; the page never leaves
      // its own data: document.
      let shownAt = 0; // 0: not shown yet, nothing can be approved
      win.webContents.on("will-navigate", (e, url) => {
        const exit = sentinelExit(url, shownAt > 0 && performance.now() - shownAt >= ARM_MS);
        if (exit === "pass") return;
        e.preventDefault();
        if (exit !== "stay") finish(exit);
      });
      win.on("closed", () => finish(false)); // closing the window ⇒ refuse
      win.webContents.on("render-process-gone", () => finish(false));
      win.once("ready-to-show", () => {
        win?.show();
        shownAt = performance.now();
      });
      void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(buildHtml(req))).catch(() => finish(false));
    } catch {
      finish(false); // any window-creation failure ⇒ refuse
    }
  });
}

/** Test-only view of the confirmation page HTML. */
export const __buildHtml = buildHtml;
