import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { composeConfirmationMode, parseConfirmationMode, type ConfirmationMode } from "@openmasq/catalog/mcp";
import type { WriteConfirmOutcome, WriteConfirmRequest } from "./writeConfirmWindow";

/**
 * MAIN's copy of the confirmation MODE (`standard` | `renforce`) — the input
 * `assertWriteAllowed` feeds the shared `confirmationSurface` policy. It lives in MAIN
 * and is persisted in MAIN's own file, never read back from a renderer-supplied setting:
 * the mode decides whether the un-spoofable window ever opens, so the renderer telling
 * main which mode it is in would be the renderer deciding its own boundary (rule 7).
 *
 * The asymmetry is the point:
 *   - upgrading to `renforce` (MORE confirmation) is honoured immediately, no prompt;
 *   - downgrading to `standard` REQUIRES an explicit click on the un-spoofable window
 *     (`mode:"leave-renforce"`), so a renderer XSS calling the IPC cannot lower the
 *     posture the user chose. Refuse / close / error ⇒ the mode stays `renforce`.
 *
 * Persisted app-globally (not per account): it is a DEVICE security posture, like the
 * OS-level gates around it. Default (no file, unreadable file) ⇒ `standard`, the product
 * default. A failed WRITE keeps the in-memory mode for the session and will re-default
 * to `standard` on restart — stated residual, bounded by the disk being broken.
 */

let dir: string | null = null;
let mode: ConfirmationMode | null = null; // null = not loaded yet (lazy)
/** The ORG's floor, pushed by the renderer alongside the org profile. Session-scoped: a
 *  floor that stopped applying must not survive a restart of a now-personal account. */
let orgFloor: ConfirmationMode | null = null;

/** Point the store at userData. Called once at app start, before any IPC lands. */
export function initConfirmationMode(userDataDir: string): void {
  dir = userDataDir;
  mode = null;
}

const fileOf = (): string | null => (dir ? join(dir, "confirmation-mode.json") : null);

function load(): ConfirmationMode {
  if (mode) return mode;
  mode = "standard";
  const f = fileOf();
  if (f) {
    try {
      const parsed = JSON.parse(readFileSync(f, "utf-8")) as { mode?: unknown };
      if (parsed?.mode === "renforce") mode = "renforce";
    } catch {
      /* missing / unreadable ⇒ the default */
    }
  }
  return mode;
}

/**
 * Publish the organisation's floor. ⚠️ It arrives from the RENDERER, which main does not
 * trust — and that is acceptable here for one specific reason: `composeConfirmationMode`
 * takes the MAXIMUM, so a forged floor can only make the app confirm MORE. It can never
 * relax a gate, which is the only direction that would matter. An unparseable value clears
 * the floor rather than guessing.
 */
export function setOrgConfirmationFloor(value: unknown): ConfirmationMode | null {
  orgFloor = parseConfirmationMode(value);
  return orgFloor;
}

/** The EFFECTIVE mode every gate reads: the stricter of the org floor and the user's
 *  choice. The user's own preference is still stored as-is, so removing the floor
 *  restores exactly what they had picked rather than a mode the policy imposed. */
export function getConfirmationMode(): ConfirmationMode {
  return composeConfirmationMode(orgFloor, load());
}

/** The member's OWN stored choice, floor excluded — what the settings toggle reflects. */
export function getUserConfirmationMode(): ConfirmationMode {
  return load();
}

/**
 * Switch the mode. `confirm` is the un-spoofable window (injected so tests can stub it);
 * it is consulted ONLY for the renforce→standard downgrade. Returns the RESULTING EFFECTIVE
 * mode — the renderer must reflect that, not its request.
 *
 * A downgrade below the org's floor is refused BEFORE the window opens: prompting for
 * something the policy will override anyway trains the user that the dialog is noise, and
 * the toggle would appear to move while nothing changed.
 */
export async function setConfirmationMode(
  next: ConfirmationMode,
  confirm: (req: WriteConfirmRequest) => Promise<WriteConfirmOutcome>,
): Promise<ConfirmationMode> {
  const current = load();
  if (composeConfirmationMode(orgFloor, next) !== next) return composeConfirmationMode(orgFloor, current);
  if (next === current) return composeConfirmationMode(orgFloor, current);
  if (next === "standard") {
    let approved = false;
    try {
      approved = (await confirm({ toolName: "", args: undefined, mode: "leave-renforce" })) === true;
    } catch {
      approved = false; // fail closed: any window error keeps the stricter mode
    }
    if (!approved) return composeConfirmationMode(orgFloor, current);
  }
  mode = next;
  const f = fileOf();
  if (f) {
    try {
      writeFileSync(f, JSON.stringify({ mode }), "utf-8");
    } catch {
      /* in-memory mode holds for the session; restart re-defaults to standard */
    }
  }
  return composeConfirmationMode(orgFloor, mode);
}

/** Test-only: forget the directory and the cached mode. */
export function _resetConfirmationMode(): void {
  dir = null;
  mode = null;
  orgFloor = null;
}
