import * as Sentry from "@sentry/electron/main";
import { app } from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type { TrackEvent } from "@openmasq/ui";

/**
 * Main-process → renderer TELEMETRY bridge: the anonymised `$exception` channel
 * (`app:error`) and the typed product-event channel (`app:event`).
 *
 * The renderer owns analytics (consent, anon id, transport + the PII `scrubMessage`),
 * so main NEVER sends telemetry itself: it forwards a bounded report over IPC and the
 * renderer runs it through `captureError` / `captureEvent`. In-process hop, so the raw
 * message is fine here — it's scrubbed before it leaves the machine.
 */
let getWin: (() => BrowserWindow | null) | null = null;

/** Wire the window getter + install process-level catch-alls. Call once in `whenReady`. */
export function installErrorReporting(win: () => BrowserWindow | null): void {
  getWin = win;
  // A stable ANONYMOUS id (UUID persisted in userData, no link to the account): this is
  // what distinguishes « 500 events = 500 machines » from « one machine looping ». Only
  // `user.id` crosses the allow-list (`sentry/policy.ts`) — never an IP, never an email.
  try {
    const p = join(app.getPath("userData"), "telemetry-id");
    let id = "";
    try {
      id = readFileSync(p, "utf8").trim();
    } catch {
      /* first time */
    }
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      id = randomUUID();
      writeFileSync(p, id, "utf8");
    }
    Sentry.setUser({ id });
  } catch {
    /* error reporting never creates an error */
  }
  // Report but DON'T exit — a background main error shouldn't hard-crash the user's
  // app; Electron keeps the window alive. (Standard desktop crash-reporting posture.)
  // ⚠️ RENDERER bridge ONLY: the SDK integrations `onUncaughtException`/
  // `onUnhandledRejection` (`sentry/main.ts`) ALREADY capture these same errors to
  // Sentry, with the correct `mechanism.handled:false` — re-capturing them here counted every
  // crash TWICE, one copy marked « handled » (observability audit 13/08).
  process.on("uncaughtException", (err) => bridgeMainError("uncaught", "main-exception", err));
  process.on("unhandledRejection", (reason) => bridgeMainError("uncaught", "main-rejection", reason));
}

/** Forward one bounded error to the renderer's error-tracking channel. Best-effort;
 *  never throws (error reporting must not create errors). */
export function reportMainError(scope: string, code: string, err: unknown): void {
  try {
    // Sentry FIRST, and outside the « a window exists » condition. This bridge
    // DROPS every report when there's no renderer — before the window is created,
    // or during `quitAndInstall`: the two moments a failure is precisely
    // hard to reproduce. Sentry itself doesn't need the renderer.
    // What the event carries is decided by `sentry/policy.ts`, not here.
    // `fingerprint: [scope, code]`: our SYNTHESIZED errors (updater, broker…) share
    // the same construction stack, and Sentry groups by stack first — without the
    // fingerprint, `updater-404` and `updater-no_space` merged into ONE issue.
    Sentry.captureException(err, { tags: { scope, code }, fingerprint: [scope, code] });
  } catch {
    /* error reporting never creates an error */
  }
  bridgeMainError(scope, code, err);
}

/** The renderer bridge alone (`app:error`) — for the uncaught case, already captured by Sentry
 *  via the SDK integrations. Best-effort; with no window, the report is dropped. */
function bridgeMainError(scope: string, code: string, err: unknown): void {
  try {
    const w = getWin?.();
    if (!w || w.isDestroyed()) return;
    const e = err as { name?: string; message?: string; status?: number } | null;
    w.webContents.send("app:error", {
      scope,
      code,
      name: e && typeof e === "object" ? e.name : undefined,
      status: e && typeof e === "object" ? e.status : undefined,
      message: err instanceof Error ? err.message : typeof err === "string" ? err : undefined,
    });
  } catch {
    /* never throw from error reporting */
  }
}

/**
 * Forward one TYPED analytics event to the renderer's `captureEvent` (same one-way
 * bridge as `reportMainError`: consent, the allow-list walk and the transport all stay
 * in the renderer). `TrackEvent` is imported type-only from the ONE catalogue
 * (`@openmasq/ui/analytics/events`), so a main-process event can't drift from it.
 *
 * ⚠️ No window (not yet created, or already torn down by `quitAndInstall`) ⇒ the event
 * is DROPPED, like an error report. Anything worth measuring across a restart must
 * therefore be re-derived on the next launch, not sent as we quit.
 */
export function reportMainEvent(event: TrackEvent): void {
  try {
    const w = getWin?.();
    if (!w || w.isDestroyed()) return;
    w.webContents.send("app:event", event);
  } catch {
    /* never throw from telemetry */
  }
}
