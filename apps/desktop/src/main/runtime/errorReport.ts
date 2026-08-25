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
  // Un id ANONYME stable (UUID persisté dans userData, aucun lien avec le compte) : c'est
  // ce qui distingue « 500 événements = 500 postes » de « un poste en boucle ». Seul
  // `user.id` traverse l'allow-list (`sentry/policy.ts`) — jamais d'IP, jamais d'email.
  try {
    const p = join(app.getPath("userData"), "telemetry-id");
    let id = "";
    try {
      id = readFileSync(p, "utf8").trim();
    } catch {
      /* première fois */
    }
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      id = randomUUID();
      writeFileSync(p, id, "utf8");
    }
    Sentry.setUser({ id });
  } catch {
    /* le rapport d'erreur ne crée jamais d'erreur */
  }
  // Report but DON'T exit — a background main error shouldn't hard-crash the user's
  // app; Electron keeps the window alive. (Standard desktop crash-reporting posture.)
  // ⚠️ Pont renderer SEULEMENT : les intégrations SDK `onUncaughtException`/
  // `onUnhandledRejection` (`sentry/main.ts`) capturent DÉJÀ ces mêmes erreurs vers
  // Sentry, avec le bon `mechanism.handled:false` — les re-capturer ici comptait chaque
  // crash DEUX fois, dont une copie marquée « handled » (audit observabilité 13/08).
  process.on("uncaughtException", (err) => bridgeMainError("uncaught", "main-exception", err));
  process.on("unhandledRejection", (reason) => bridgeMainError("uncaught", "main-rejection", reason));
}

/** Forward one bounded error to the renderer's error-tracking channel. Best-effort;
 *  never throws (error reporting must not create errors). */
export function reportMainError(scope: string, code: string, err: unknown): void {
  try {
    // Sentry D'ABORD, et hors de la condition « une fenêtre existe ». Ce pont-ci
    // ABANDONNE tout rapport quand il n'y a pas de renderer — avant la création de la
    // fenêtre, ou pendant `quitAndInstall` : deux moments où une panne est justement
    // difficile à reproduire. Sentry, lui, n'a pas besoin du renderer.
    // Ce que l'événement emporte est décidé par `sentry/policy.ts`, pas ici.
    // `fingerprint: [scope, code]` : nos erreurs SYNTHÉTISÉES (updater, broker…) partagent
    // toutes la même pile de construction, et Sentry groupe d'abord par pile — sans le
    // fingerprint, `updater-404` et `updater-no_space` fusionnaient en UNE issue.
    Sentry.captureException(err, { tags: { scope, code }, fingerprint: [scope, code] });
  } catch {
    /* le rapport d'erreur ne crée jamais d'erreur */
  }
  bridgeMainError(scope, code, err);
}

/** Le pont renderer seul (`app:error`) — pour l'uncaught, dont Sentry est déjà saisi
 *  par les intégrations SDK. Best-effort ; sans fenêtre, le rapport est abandonné. */
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
