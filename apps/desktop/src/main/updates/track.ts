import { app } from "electron";
import electronUpdater from "electron-updater";
import type { TrackEvent } from "@openmasq/ui";
import { getConfig, updateConfig } from "./config";
import { logUpdate } from "./log";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

/**
 * The update FUNNEL as product events (the counterpart of `report.ts`, which speaks only
 * on failure), through the injected reporter so this module is free of the bridge. check →
 * downloaded → install → installed; the last two are reported on the NEXT launch, from
 * disk: the swap happens after we quit (`pendingInstall` in `config.ts`).
 */
export type ReportEvent = (event: TrackEvent) => void;

let emit: ReportEvent = () => {};

/** The version downloaded this session: the only one `quitAndInstall` can install. */
let downloadedVersion: string | null = null;

/** A placeholder, so an event with no version still counts in the funnel. */
const UNKNOWN = "unknown";

/** The renderer subscribes to `app:event` while it boots: anything sent earlier is dropped. */
const RENDERER_READY_MS = 8000;

/**
 * The PREVIOUS session's outcome from persisted state (pure, `track.test.ts`):
 * `pendingInstall` ⇒ an install ATTEMPT; a different running version ⇒ it LANDED. An
 * attempt with no landing is the silent failure this channel exists to see. A first launch
 * (no `lastVersion`) yields nothing.
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
  // Always re-baseline, so a consumed `pendingInstall` is never re-reported.
  if (pendingInstall || lastVersion !== current)
    updateConfig({ lastVersion: current, pendingInstall: undefined });
}

/** Wire the live half (check / downloaded) and schedule the cross-launch half. Telemetry
 *  only; `index.ts` owns the log and the status stream. */
export function setupUpdateTracking(report?: ReportEvent): void {
  if (report) emit = report;
  autoUpdater.on("update-available", (info) => {
    emit({
      name: "update_check",
      channel: getConfig().channel,
      result: "available",
      // `found_version`, NOT `version`: the version FOUND on the feed must not read as the
      // one RUNNING. update_downloaded/install keep `version` (the artifact's).
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

/** Record the install attempt SYNCHRONOUSLY to disk: the renderer owns the transport and
 *  is about to die, so an IPC hop would lose the one event whose absence matters. */
export function trackUpdateInstall(): void {
  updateConfig({ pendingInstall: downloadedVersion ?? UNKNOWN });
}
