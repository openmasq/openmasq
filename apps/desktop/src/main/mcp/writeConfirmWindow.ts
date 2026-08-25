import { BrowserWindow } from "electron";
import { DEVTOOLS_PREF } from "../devtools";
import { buildHtml, ALLOW_URL, ALLOW_TOOL_URL, DENY_URL } from "./writeConfirmHtml";

/**
 * SECURITY (audit M6, write-gate v2): a MAIN-OWNED write-confirmation surface that is
 * NOT the app renderer and NOT the native OS dialog.
 *
 * Why not a renderer-minted approval token (the previous design): the token was minted
 * by an IPC the untrusted renderer can call with NO user gesture, so a renderer XSS —
 * the exact threat M6 exists for — self-minted a matching token and skipped confirmation
 * entirely. Any confirmation living in the app renderer's DOM is likewise forgeable by
 * XSS. The only un-spoofable confirmation is a surface the app renderer cannot script.
 *
 * Why not the native `dialog.showMessageBox`: product requirement — keep a branded,
 * in-app-looking confirmation rather than the jarring OS dialog.
 *
 * Solution: a dedicated, frameless, modal `BrowserWindow` OWNED BY MAIN, isolated from
 * the app renderer's JS context. The app renderer's XSS has no handle to this window —
 * it cannot script it, auto-click it, or read its result. The page is OUR trusted HTML
 * built here (a `data:` URL, args HTML-escaped), loaded with `sandbox:true` +
 * `contextIsolation:true` + `nodeIntegration:false` and **no preload**, so the page has
 * ZERO Node/IPC capability even if a hostile arg string tried to inject. The ONLY exit
 * is a click on Autoriser/Refuser, which navigates to a sentinel URL that main intercepts
 * via `will-navigate` (no preload/IPC channel needed → no build-config change). FAIL
 * CLOSED: closing the window, a load error, or the timeout all resolve to REFUSED; only
 * an explicit Autoriser click resolves to allowed.
 */

export interface WriteConfirmRequest {
  /** Real tool name, e.g. `gmail__send_email`. */
  toolName: string;
  /** The REAL (un-redacted) args main is about to send — so the user sees the actual
   *  recipient/subject and can judge legitimacy. Never leaves the machine from here. */
  args: unknown;
  /** `"disable-gate"` swaps the copy: instead of confirming ONE write, it asks the user to
   *  turn OFF per-action confirmation for the session (auto-approve). Same un-spoofable
   *  window, so ENABLING auto-approve still requires a real click — a renderer XSS calling
   *  the enabling IPC can't grant it. `"leave-renforce"` asks to leave the Mode renforcé
   *  (`confirmationMode.ts`) — the same reasoning: DOWNGRADING the confirmation posture
   *  must be a real click on a surface the renderer can't script. Default `"write"`. */
  mode?: "write" | "disable-gate" | "leave-renforce";
}

// Sentinel navigation targets are defined in `writeConfirmHtml.ts` (written into the page)
// and imported above — intercepted here in `will-navigate`.
const TIMEOUT_MS = 2 * 60_000;

/** The window's outcome: a plain one-shot approval, an approval that ALSO remembers the
 *  tool for the session (« Toujours pour cet outil »), or a refusal. `boolean` is kept
 *  in the union so existing test stubs (`async () => true`) stay valid. */
export type WriteConfirmOutcome = boolean | "allow-tool";

/** The confirm implementation is injectable so the gate can be unit-tested without a
 *  real window (a BrowserWindow can't render in a headless test). */
let impl: (req: WriteConfirmRequest) => Promise<WriteConfirmOutcome> = confirmInWindow;

/** Ask the user, on a MAIN-OWNED surface, to confirm a mutating tool call. Truthy ONLY
 *  on an explicit approval; false on refuse / close / timeout / error (fail closed).
 *  `"allow-tool"` = approved AND remember this tool for the session (recorded here, so
 *  the memory — like the auto-approve flag — can only ever be armed by a real click on
 *  the un-spoofable window, never by a renderer IPC). */
export async function confirmWrite(req: WriteConfirmRequest): Promise<boolean> {
  const outcome = await impl(req);
  if (outcome === "allow-tool" && req.toolName) sessionAllowedTools.add(req.toolName);
  return outcome === true || outcome === "allow-tool";
}

// ── Per-tool session memory ─────────────────────────────────────────────────────────────
// Tools the user chose to stop confirming for the REST of this app session — armed ONLY
// by the « Toujours pour cet outil » click INSIDE the un-spoofable window (above), so a
// renderer XSS cannot add to it. Keyed by the REAL tool name; in-memory, resets on
// restart (fail-safe default), narrower than the global auto-approve.
const sessionAllowedTools = new Set<string>();

/** Whether this exact tool was session-approved on the main-owned window. */
export function isToolWriteApproved(realName: string): boolean {
  return sessionAllowedTools.has(realName);
}

// ── Session auto-approve ────────────────────────────────────────────────────────────────
// When ON, `assertWriteAllowed` skips the per-action window for the REST of this app session.
// SECURITY: it is turned ON only through `setWriteAutoApprove(true)`, which pops the SAME
// un-spoofable window — so a renderer XSS can call the enabling IPC but cannot actually flip
// it (it can't click "Autoriser"). In-memory + session-scoped: it RESETS to protected on
// restart (fail-safe default), and disabling is honoured immediately with no prompt.
let sessionAutoApprove = false;

/** Whether per-action write confirmation is currently auto-approved for this session. */
export function isWriteAutoApproved(): boolean {
  return sessionAutoApprove;
}

/** Arm (`true`) or disarm (`false`) session auto-approve. Enabling REQUIRES an explicit
 *  approval on the main-owned window; returns the RESULTING state so the renderer reflects
 *  reality (a refused/closed enable stays protected). Disabling never prompts. */
export async function setWriteAutoApprove(enable: boolean): Promise<boolean> {
  if (!enable) {
    sessionAutoApprove = false;
    return false;
  }
  if (sessionAutoApprove) return true;
  // Strictly `true`: the disable-gate window has no per-tool button, and nothing else
  // may arm the GLOBAL flag.
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
      // The ONLY way out: a click navigating to a sentinel URL. Everything else (incl. a
      // hostile arg that somehow triggered navigation) is blocked; the page never leaves
      // its own data: document.
      win.webContents.on("will-navigate", (e, url) => {
        // ⚠️ ALLOW_TOOL_URL shares the ALLOW_URL prefix — it MUST be tested first, or
        // `startsWith(ALLOW_URL)` swallows it and the memory click degrades to one-shot.
        if (url.startsWith(ALLOW_TOOL_URL)) {
          e.preventDefault();
          finish("allow-tool");
        } else if (url.startsWith(ALLOW_URL)) {
          e.preventDefault();
          finish(true);
        } else if (url.startsWith(DENY_URL)) {
          e.preventDefault();
          finish(false);
        } else if (!url.startsWith("data:")) {
          e.preventDefault();
        }
      });
      win.on("closed", () => finish(false)); // closing the window ⇒ refuse
      win.webContents.on("render-process-gone", () => finish(false));
      win.once("ready-to-show", () => win?.show());
      void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(buildHtml(req))).catch(() => finish(false));
    } catch {
      finish(false); // any window-creation failure ⇒ refuse
    }
  });
}

/** Test-only view of the confirmation page HTML. */
export const __buildHtml = buildHtml;
