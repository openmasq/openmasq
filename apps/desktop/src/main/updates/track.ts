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

/** What this session already reported. electron-updater re-emits `update-downloaded` on
 *  every periodic check once the file is cached, which counted ONE download every 15 min. */
const reported = new Set<string>();
const once = (key: string): boolean => (reported.has(key) ? false : (reported.add(key), true));

/** Why the automatic install is holding a staged build back (`autoInstall.ts`). */
export type InstallDeferReason = "in_use" | "busy_main" | "busy_renderer" | "no_answer";

/** Report a deferral ONCE per version and reason: the funnel shows WHY a downloaded build
 *  waits (a focused window, a turn, a draft) instead of an unexplained gap. */
export function trackInstallDeferred(reason: InstallDeferReason): void {
  const version = downloadedVersion ?? UNKNOWN;
  if (!once(`deferred:${version}:${reason}`)) return;
  emit({ name: "update_install_deferred", channel: getConfig().channel, version, reason });
}

/** A check/download that hung and was released (`poll.ts` `STALL_MS`): without it, an
 *  install that silently stopped asking the feed looks like one on the latest version. */
export function trackCheckStalled(): void {
  emit({ name: "update_check", channel: getConfig().channel, result: "stalled" });
}

/** A placeholder, so an event with no version still counts in the funnel. */
const UNKNOWN = "unknown";



/**
 * The PREVIOUS session's outcome from persisted state (pure, `track.test.ts`):
 * `pendingInstall` ⇒ an install ATTEMPT; a different running version ⇒ it LANDED; an
 * attempt relaunching on the SAME version ⇒ it FAILED, said explicitly so the funnel needs
 * no anti-join to see it (on every OS — `shipit.ts` only reads the macOS log). A first
 * launch (no `lastVersion`) yields nothing.
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
  else if (pendingInstall && lastVersion && pendingInstall !== current)
    events.push({ name: "update_install_failed", channel, version: pendingInstall, running: current });
  return events;
}

/** The update this launch LANDED on, handed ONCE to the renderer (`takeJustUpdated`) so it
 *  shows what the version brings. Consumed on read: a recreated window does not re-announce. */
let justUpdated: { from: string; to: string } | null = null;

export function takeJustUpdated(): { from: string; to: string } | null {
  const j = justUpdated;
  justUpdated = null;
  return j;
}

/** Report the previous session's install attempt / landing, then re-baseline the file. */
function flushLastSession(): void {
  const { channel, lastVersion, pendingInstall } = getConfig();
  const current = app.getVersion();
  for (const e of lastSessionEvents({ channel, lastVersion, pendingInstall, current })) {
    if (e.name === "update_installed") {
      logUpdate(`update applied: v${e.from} → v${e.to}`);
      justUpdated = { from: e.from, to: e.to };
    }
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
    if (!once(`downloaded:${downloadedVersion}`)) return;
    emit({ name: "update_downloaded", channel: getConfig().channel, version: downloadedVersion });
  });
  // Emitted now: the bridge holds it until a renderer listens (`runtime/errorReport.ts`).
  flushLastSession();
}

/** Record the install attempt SYNCHRONOUSLY to disk: the renderer owns the transport and
 *  is about to die, so an IPC hop would lose the one event whose absence matters. */
export function trackUpdateInstall(): void {
  updateConfig({ pendingInstall: downloadedVersion ?? UNKNOWN });
}
