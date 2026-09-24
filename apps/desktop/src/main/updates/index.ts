import { app, dialog, shell, type BrowserWindow } from "electron";
import { handle, obj } from "../ipc/handle";
import electronUpdater from "electron-updater";

import {
  fmtGB,
  humanizeUpdateError,
  totalUpdateSize,
} from "./disk";
import {
  applyFeed,
  deviceQuery,
  feedBase,
  getConfig,
  loadConfig,
  UPDATES_CONFIGURED,
  UPDATES_URL,
} from "./config";
import { requestChannelChange, selfPinAllowed } from "./channel";
import { logUpdate, logUpdateError, updaterLogger, updaterLogPath } from "./log";
import { reportUpdateFailure } from "./report";
import { ensureUpdateConfigFile } from "./appUpdateConfig";
import { wireDownloaded } from "./downloaded";
import { quitAndInstallSafely, setBeforeInstall } from "./install";
import { startAutoInstall } from "./autoInstall";
import { ownDownloadPromise, startUpdateChecks } from "./poll";
import { detectAndReportShipItFailure } from "./shipit";
import { setupUpdateTracking, type ReportEvent } from "./track";

/** Injected error reporter, so this module never imports the telemetry bridge. */
type ReportError = (code: string, err: unknown) => void;
let reportError: ReportError = () => {};

// The update feed is DYNAMIC: `<feed>/desktop/<channel>` serves a latest-mac.yml the
// server chooses (rollout, rollback), and `/v/<version>` pins an exact build.
// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

function wireEvents(getWin: () => BrowserWindow | null): void {
  const send = (payload: Record<string, unknown>): void => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send("updates:status", payload);
  };
  // Every lifecycle step also goes to `updater.log`: a self-contained timeline.
  let lastPct = -1;
  autoUpdater.on("checking-for-update", () => {
    logUpdate("checking for update", `feed=${feedBase(getConfig().channel)}`);
    send({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    logUpdate(`update available: v${info?.version} (${fmtGB(totalUpdateSize(info))})`);
    lastPct = -1;
    send({ state: "available", version: info?.version, sizeBytes: totalUpdateSize(info) });
  });
  autoUpdater.on("update-not-available", (info) => {
    logUpdate(`up to date (running v${app.getVersion()}, latest v${info?.version})`);
    send({ state: "not-available", version: info?.version });
  });
  autoUpdater.on("download-progress", (p) => {
    // 20% milestones, so a stalled download is visible without a line per tick.
    const pct = Math.floor((p?.percent ?? 0) / 20) * 20;
    if (pct > lastPct) {
      lastPct = pct;
      logUpdate(`downloading ${pct}%`, p?.bytesPerSecond ? `(${fmtGB(p.bytesPerSecond)}/s)` : "");
    }
    send({ state: "downloading", percent: p?.percent ?? 0 });
  });
  autoUpdater.on("update-downloaded", (info) => {
    logUpdate(`downloaded v${info?.version} (${fmtGB(totalUpdateSize(info))}) — ready to install`);
    send({ state: "downloaded", version: info?.version, sizeBytes: totalUpdateSize(info) });
  });
  autoUpdater.on("error", (err) => {
    // The raw reason stays in the log; the UI gets the safe message.
    logUpdateError("updater-event", err);
    const { code, message } = humanizeUpdateError(err);
    // EXCEPT `read_only_volume`: an ENVIRONMENT fact (running from the .dmg), not a
    // failure. Logged and told to the user, never alerted on.
    if (code !== "read_only_volume") reportUpdateFailure(reportError, code, err);
    send({ state: "error", code, message });
  });
}

function registerUpdateIpc(): void {
  // Available in dev too, so Settings renders the current version and the releases list.
  // The log path is FIXED main-side (no renderer input: not a disk-read primitive).
  handle("updates:reveal-log", [], () => {
    shell.showItemInFolder(updaterLogPath());
  });
  handle("updates:current", [], () => ({
    version: app.getVersion(),
    channel: getConfig().channel,
    installId: getConfig().installId,
  }));

  // ⛔ No `updates:set-auto`: an IPC channel that can turn updates off is a door to turn
  // them off from a compromised renderer.

  handle("updates:list", [], async () => {
    const res = await fetch(`${feedBase(getConfig().channel)}/releases`);
    if (!res.ok) throw new Error(`releases ${res.status}`);
    return res.json();
  });

  // This install's self-pin permission (granted by an operator). The feed enforces it AND
  // main re-checks it before a channel move (`channel.ts`); this is only the UI hint.
  handle("updates:permissions", [], async () => ({ allow_self_pin: await selfPinAllowed() }));

  handle("updates:check", [], async () => {
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    autoUpdater.allowDowngrade = false;
    applyFeed(getConfig().channel);
    // The download rejects with nobody owning it (`ownDownloadPromise`).
    ownDownloadPromise(await autoUpdater.checkForUpdates());
    return { ok: true };
  });

  // Force an exact build (rollback or forced upgrade).
  handle("updates:pin", [obj], async (_e, raw) => {
    const arg = raw as { version: string };
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    if (!arg?.version) return { ok: false, reason: "no_version" };
    // Pinning is a DOWNGRADE primitive (an older build, vulnerabilities included): the
    // renderer is not trusted to authorise one. Fail-closed.
    if (!(await selfPinAllowed())) return { ok: false, reason: "not_allowed" };
    autoUpdater.allowDowngrade = true;
    applyFeed(getConfig().channel, arg.version);
    ownDownloadPromise(await autoUpdater.checkForUpdates());
    return { ok: true };
  });

  // Moving channel = moving ENVIRONMENT: allow-listed target, gated on the server-verified
  // permission. The decision lives in `channel.ts`; the renderer only asks.
  handle("updates:set-channel", [obj], (_e, raw) =>
    requestChannelChange((raw as { channel?: unknown })?.channel),
  );

  // Cross-environment release list, served ONLY to a device with the self-pin permission.
  // Fail-safe to not-privileged.
  handle("updates:list-all", [], async () => {
    // No feed (local build, self-hosted fork): no request, an empty list.
    if (!UPDATES_CONFIGURED) return { privileged: false, channels: [] };
    try {
      const res = await fetch(`${UPDATES_URL}/desktop/all-releases${deviceQuery()}`);
      if (!res.ok) return { privileged: false, channels: [] };
      return (await res.json()) as { privileged: boolean; channels: unknown[] };
    } catch {
      return { privileged: false, channels: [] };
    }
  });

  // Jump to an exact build on ANOTHER channel; persists the channel.
  handle("updates:switch", [obj], async (_e, raw) => {
    const arg = raw as { channel: string; version: string };
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    if (!arg?.channel || !arg?.version) return { ok: false, reason: "no_target" };
    // Same gate as set-channel: the channel move alone would already hand this install
    // the other environment's next build.
    const moved = await requestChannelChange(arg.channel);
    if (!moved.ok) return moved;
    autoUpdater.allowDowngrade = true;
    applyFeed(moved.channel, arg.version);
    ownDownloadPromise(await autoUpdater.checkForUpdates());
    return { ok: true };
  });

  // Child Electron instances are killed FIRST (install.ts): ShipIt aborts on >1 instance.
  handle("updates:install", [], () => quitAndInstallSafely());
}

// `getWin` yields the CURRENT main window so status events survive a window recreate.
export function setupAutoUpdates(
  getWin: () => BrowserWindow | null,
  hooks?: {
    onBeforeInstall?: () => Promise<void>;
    reportError?: ReportError;
    reportEvent?: ReportEvent;
    /** Work in flight on the MAIN side (`chat:*` streams) — auto-install abstains. */
    mainBusy?: () => boolean;
  },
): void {
  loadConfig();
  autoUpdater.logger = updaterLogger;
  // Always (`config.ts`).
  autoUpdater.autoDownload = true;
  autoUpdater.allowDowngrade = false;
  if (hooks?.onBeforeInstall) setBeforeInstall(hooks.onBeforeInstall);
  if (hooks?.reportError) reportError = hooks.reportError;
  registerUpdateIpc();

  // Packaged, signed builds only; the IPC above still serves the UI in dev.
  if (!app.isPackaged) return;
  // No feed: probe nothing, install nothing. Updating from ANOTHER's feed would replace
  // this binary with theirs.
  if (!UPDATES_CONFIGURED) return;

  // A bundle missing `app-update.yml` is healed in userData AND reported: a packaging
  // regression healed silently stays invisible.
  const heal = ensureUpdateConfigFile();
  if (heal) reportUpdateFailure(reportError, "config-missing", new Error(heal.detail));

  applyFeed(getConfig().channel);
  wireEvents(getWin);
  // Funnel telemetry (separate listeners: the wiring above stays the one UI talker).
  setupUpdateTracking(hooks?.reportEvent);

  // A ShipIt swap failure happens AFTER we quit: detected on the next launch, delayed so
  // the renderer's subscription is live.
  setTimeout(() => detectAndReportShipItFailure(reportError), 8000).unref?.();

  wireDownloaded(getWin, () => reportError);

  // A staged build INSTALLS ITSELF when the app is left open for days. Guards: `autoInstall.ts`.
  startAutoInstall(getWin, { mainBusy: hooks?.mainBusy ?? (() => false) });

  autoUpdater.on("error", (err) => {
    logUpdateError("auto-update", err);
    // The download itself can ENOSPC before the apply pre-check runs.
    const { code, message } = humanizeUpdateError(err);
    if (code === "no_space") {
      const win = getWin();
      void dialog
        .showMessageBox({
          type: "warning",
          buttons: ["OK"],
          message: "Mise à jour impossible",
          detail: message,
          ...(win ? { window: win } : {}),
        })
        .catch(() => {});
    }
  });

  // Check on launch AND periodically (`poll.ts`).
  startUpdateChecks();
}
