import { app } from "electron";
import electronUpdater from "electron-updater";
import type { TrackEvent } from "@openmasq/ui";
import { getConfig, updateConfig } from "./config";
import { logUpdate } from "./log";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

/**
 * The update FUNNEL as product events — the counterpart to `report.ts` (which only ever
 * speaks on failure). Without this, a successful update produced ZERO telemetry and an
 * update that silently never applied was indistinguishable from a user who simply never
 * updated. Emitted through the injected reporter (→ `reportMainEvent` → the renderer's
 * consent-gated, allow-listed `captureEvent`), so this module stays free of the bridge
 * AND of the analytics transport.
 *
 * check → downloaded → install → installed. The last two are reported on the NEXT
 * launch, from disk: a ShipIt swap happens after we quit, so in-process there is nobody
 * left to send anything (see `pendingInstall` in `config.ts`).
 */
export type ReportEvent = (event: TrackEvent) => void;

let emit: ReportEvent = () => {};

/** The version whose download completed this session — the only one `quitAndInstall`
 *  can install, so it's what an install attempt records (`install.ts` has no info). */
let downloadedVersion: string | null = null;

/** electron-updater handed us no version (never seen in practice) — a placeholder, so
 *  the event still counts in the funnel instead of vanishing on a missing field. */
const UNKNOWN = "unknown";

/** The renderer subscribes to `app:event` while it boots, so anything sent in the first
 *  moments of `whenReady` is dropped. Same delay, same reason as the ShipIt detector. */
const RENDERER_READY_MS = 8000;

/**
 * The PREVIOUS session's outcome, decided from persisted state alone (pure → unit
 * tested in `track.test.ts`):
 * - `pendingInstall` set ⇒ that session handed a build to ShipIt (an install ATTEMPT).
 * - the running version differs from `lastVersion` ⇒ the swap actually LANDED.
 *
 * An attempt with no landing is the silent ShipIt failure this whole channel exists to
 * make visible. A first launch ever (no `lastVersion`) is an INSTALL, not an update, and
 * yields nothing.
 */
export function lastSessionEvents(state: {
  channel: string;
  lastVersion?: string;
  pendingInstall?: string;
  current: string;
}): TrackEvent[] {
  const { channel, lastVersion, pendingInstall, current } = state;
  const events: TrackEvent[] = [];
  if (pendingInstall) events.push({ name: "update_install", channel, version: pendingInstall });
  if (lastVersion && lastVersion !== current)
    events.push({ name: "update_installed", channel, from: lastVersion, to: current });
  return events;
}

/** Report the previous session's install attempt / landing, then re-baseline the file. */
function flushLastSession(): void {
  const { channel, lastVersion, pendingInstall } = getConfig();
  const current = app.getVersion();
  for (const e of lastSessionEvents({ channel, lastVersion, pendingInstall, current })) {
    if (e.name === "update_installed") logUpdate(`update applied: v${e.from} → v${e.to}`);
    emit(e);
  }
  // Always re-baseline: `lastVersion` must track the running build even on a first
  // launch (nothing emitted then), and a consumed `pendingInstall` must not be
  // re-reported at every subsequent launch.
  if (pendingInstall || lastVersion !== current)
    updateConfig({ lastVersion: current, pendingInstall: undefined });
}

/**
 * Wire the funnel's live half (check / downloaded) and schedule the cross-launch half.
 * Packaged-only, like the rest of the real updater — `wireEvents` in `index.ts` owns the
 * file log + the renderer status stream; this owns telemetry, and nothing else.
 */
export function setupUpdateTracking(report?: ReportEvent): void {
  if (report) emit = report;
  autoUpdater.on("update-available", (info) => {
    emit({
      name: "update_check",
      channel: getConfig().channel,
      result: "available",
      // `found_version`, NOT `version`: PostHog displayed this field as "App version"
      // right next to the `app_version` stamped on every event — the version
      // FOUND on the feed read as the version CURRENTLY RUNNING (the false "drift"
      // on 07/08). update_downloaded/install keep `version`: there, it really is
      // the version of the artifact concerned.
      found_version: info?.version ?? UNKNOWN,
    });
  });
  autoUpdater.on("update-not-available", (info) => {
    emit({
      name: "update_check",
      channel: getConfig().channel,
      result: "up_to_date",
      found_version: info?.version ?? UNKNOWN,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    downloadedVersion = info?.version ?? UNKNOWN;
    emit({ name: "update_downloaded", channel: getConfig().channel, version: downloadedVersion });
  });
  setTimeout(flushLastSession, RENDERER_READY_MS).unref?.();
}

/**
 * Record the install attempt SYNCHRONOUSLY to disk, on the way into `quitAndInstall`.
 * Deliberately not an event: the renderer owns the transport and is about to die with
 * the app, so an IPC hop here would lose the one event whose absence we care about.
 * `flushLastSession` reports it on the next launch.
 */
export function trackUpdateInstall(): void {
  updateConfig({ pendingInstall: downloadedVersion ?? UNKNOWN });
}
