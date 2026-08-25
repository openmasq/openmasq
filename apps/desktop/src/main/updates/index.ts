import { app, dialog, shell, type BrowserWindow } from "electron";
import { handle, obj } from "../ipc/handle";
import electronUpdater from "electron-updater";

import {
  APPLY_SPACE_FACTOR,
  fmtGB,
  freeBytes,
  humanizeUpdateError,
  totalUpdateSize,
} from "./disk";
import {
  applyFeed,
  deviceQuery,
  feedBase,
  getConfig,
  loadConfig,
  UPDATES_URL,
  updateConfig,
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

/** Optional main-process error reporter (injected → `reportMainError`), so updater errors
 *  reach the `$exception` telemetry channel without this module importing the bridge. */
type ReportError = (code: string, err: unknown) => void;
let reportError: ReportError = () => {};

// Auto-update via the unified updates Worker (apps/updates), NOT a static R2
// feed: electron-updater points at `<worker>/desktop/<channel>`, which serves a
// DYNAMIC latest-mac.yml — the Worker chooses the version + injects
// `stagingPercentage` from the server-side rollout rules, so channels / canary
// rollout / rollback all live on the server. Pinning an exact build (the in-app
// version picker's forced up/downgrade) points the feed at
// `<worker>/desktop/<channel>/v/<version>` with allowDowngrade on.
//
// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

function wireEvents(getWin: () => BrowserWindow | null): void {
  const send = (payload: Record<string, unknown>): void => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send("updates:status", payload);
  };
  // Mirror every lifecycle step into the file log too (not just the renderer), so a
  // failed check/download leaves a self-contained timeline in `updater.log` — the
  // version, size, channel/feed and % reached — next to electron-updater's own lines.
  let lastPct = -1;
  autoUpdater.on("checking-for-update", () => {
    logUpdate("checking for update", `feed=${feedBase(getConfig().channel)}`);
    send({ state: "checking" });
  });
  // `sizeBytes` = the download weight, surfaced so the UI can show it (Settings → Versions).
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
    // Log at 20% milestones (with speed) so a stalled/slow download is visible without
    // flooding the file with a line per tick.
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
    // Keep the raw reason in the updater log (the UI only ever gets the safe message).
    logUpdateError("updater-event", err);
    const { code, message } = humanizeUpdateError(err);
    // Volet 1: route the (catchable) download/check/signature failures into telemetry,
    // tagged with the specific code + channel/version context so PostHog is diagnosable.
    // ⚠️ SAUF `read_only_volume` : ce n'est pas une panne de mise à jour mais un fait
    // d'ENVIRONNEMENT (l'app tourne depuis le .dmg / Downloads), corrigeable seulement
    // par l'utilisateur en déplaçant l'app. Le remonter en `$exception` polluait Sentry
    // (5 utilisateurs, 27 fois sur la 0.7.6) pour un « bug » qui n'en est pas un. On le
    // LOGGUE et on le DIT à l'utilisateur (message ci-dessous), on ne l'alerte pas.
    if (code !== "read_only_volume") reportUpdateFailure(reportError, code, err);
    send({ state: "error", code, message });
  });
}

function registerUpdateIpc(): void {
  // Available in dev too, so the settings UI can render the current version +
  // the published releases list even without a real update check.
  // Révéler le journal de mise à jour dans le Finder/Explorateur. Chemin FIXE côté main
  // (aucune entrée du renderer — pas une primitive de lecture disque, audit 13/08 G11).
  handle("updates:reveal-log", [], () => {
    shell.showItemInFolder(updaterLogPath());
  });
  handle("updates:current", [], () => ({
    version: app.getVersion(),
    channel: getConfig().channel,
    installId: getConfig().installId,
  }));

  // ⛔ Aucun `updates:set-auto`. La mise à jour est toujours automatique — un canal IPC qui
  // sait l'éteindre est une porte pour l'éteindre, y compris depuis un renderer compromis.

  handle("updates:list", [], async () => {
    const res = await fetch(`${feedBase(getConfig().channel)}/releases`);
    if (!res.ok) throw new Error(`releases ${res.status}`);
    return res.json();
  });

  // This install's self-pin permission (set by an operator via /admin/devices).
  // The version picker only offers rollback/pin when granted. The Worker enforces
  // it on the feed AND main re-checks it before a channel move (`channel.ts`), so
  // this call is only the UI hint. Fail-safe to `false` (no picker).
  handle("updates:permissions", [], async () => ({ allow_self_pin: await selfPinAllowed() }));

  handle("updates:check", [], async () => {
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    autoUpdater.allowDowngrade = false;
    applyFeed(getConfig().channel);
    // The download this kicks off rejects on failure with nobody owning it (see
    // `ownDownloadPromise`) — the `error` event already reports it.
    ownDownloadPromise(await autoUpdater.checkForUpdates());
    return { ok: true };
  });

  // Force an exact build (rollback or forced upgrade). allowDowngrade lets
  // electron-updater move to an OLDER version than the running one.
  handle("updates:pin", [obj], async (_e, raw) => {
    const arg = raw as { version: string };
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    if (!arg?.version) return { ok: false, reason: "no_version" };
    autoUpdater.allowDowngrade = true;
    applyFeed(getConfig().channel, arg.version);
    ownDownloadPromise(await autoUpdater.checkForUpdates());
    return { ok: true };
  });

  // Moving channel = moving ENVIRONMENT (the other channel's build has the other
  // env's URLs baked in), so the target is allow-listed and — unless it's this
  // build's own channel — gated on the server-verified self-pin permission. The
  // whole decision lives in `channel.ts`; the renderer only asks.
  handle("updates:set-channel", [obj], (_e, raw) =>
    requestChannelChange((raw as { channel?: unknown })?.channel),
  );

  // Privileged cross-environment release list: the Worker returns releases from
  // BOTH desktop channels (staging + production) ONLY when this device has the
  // self-pin permission (else 403). Fail-safe to not-privileged on any error, so
  // the picker degrades to the device's own channel.
  handle("updates:list-all", [], async () => {
    try {
      const res = await fetch(`${UPDATES_URL}/desktop/all-releases${deviceQuery()}`);
      if (!res.ok) return { privileged: false, channels: [] };
      return (await res.json()) as { privileged: boolean; channels: unknown[] };
    } catch {
      return { privileged: false, channels: [] };
    }
  });

  // Jump this install to an exact build on ANOTHER channel/environment. The other
  // channel's build carries that env's baked URLs, so switching staging↔production
  // is a reinstall of the other environment's app. Persists the channel so the
  // device stays on the chosen env for future auto-checks.
  handle("updates:switch", [obj], async (_e, raw) => {
    const arg = raw as { channel: string; version: string };
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    if (!arg?.channel || !arg?.version) return { ok: false, reason: "no_target" };
    // Same gate as set-channel: the pin below is refused server-side without the
    // permission, but the channel move alone would already hand this install the
    // other environment's next build.
    const moved = await requestChannelChange(arg.channel);
    if (!moved.ok) return moved;
    autoUpdater.allowDowngrade = true;
    applyFeed(moved.channel, arg.version);
    ownDownloadPromise(await autoUpdater.checkForUpdates());
    return { ok: true };
  });

  // Kill every self-spawned child Electron instance FIRST (see install.ts), then
  // quitAndInstall — otherwise ShipIt sees >1 instance and aborts the swap.
  handle("updates:install", [], () => quitAndInstallSafely());
}

// Wire the auto-updater + its IPC. `getWin` yields the current main window so status
// events reach the renderer even after a window recreate. Hooks (both optional):
// `onBeforeInstall` tears down the self-spawned child instances before quitAndInstall;
// `reportError` routes updater failures into the `$exception` telemetry channel;
// `reportEvent` routes the update FUNNEL (check/downloaded/install/installed) into the
// product-events channel — without it a successful update is invisible (`track.ts`).
export function setupAutoUpdates(
  getWin: () => BrowserWindow | null,
  hooks?: {
    onBeforeInstall?: () => Promise<void>;
    reportError?: ReportError;
    reportEvent?: ReportEvent;
    /** Du travail en vol côté MAIN (flux `chat:*`) — l'auto-installation s'abstient. */
    mainBusy?: () => boolean;
  },
): void {
  loadConfig();
  autoUpdater.logger = updaterLogger;
  // Toujours : plus rien ne peut le mettre à false (voir `config.ts`).
  autoUpdater.autoDownload = true;
  autoUpdater.allowDowngrade = false;
  if (hooks?.onBeforeInstall) setBeforeInstall(hooks.onBeforeInstall);
  if (hooks?.reportError) reportError = hooks.reportError;
  registerUpdateIpc();

  // Updates only apply to packaged, signed builds — skip the real feed/check in
  // dev, but the IPC above still serves current()/list() so the UI renders.
  if (!app.isPackaged) return;

  // Bundle amputé d'`app-update.yml` (la régression 0.6.0) : reconstruire l'équivalent
  // dans userData pour que l'updater vive, ET le rapporter — une régression
  // d'empaquetage guérie en silence resterait invisible jusqu'à la suivante.
  const heal = ensureUpdateConfigFile();
  if (heal) reportUpdateFailure(reportError, "config-missing", new Error(heal.detail));

  applyFeed(getConfig().channel);
  wireEvents(getWin);
  // Telemetry for the funnel (separate listeners, so the log/status wiring above stays
  // the single place that talks to the UI). Also schedules the cross-launch report of
  // the previous session's install attempt.
  setupUpdateTracking(hooks?.reportEvent);

  // Volet 2: a ShipIt swap failure happens AFTER we quit (uncatchable in-process), so
  // detect+report the LAST attempt's failure here on the next launch. Delayed so the
  // renderer's analytics/onAppError subscription is live before we send.
  setTimeout(() => detectAndReportShipItFailure(reportError), 8000).unref?.();

  // Le build posé : pré-vol d'espace disque, puis le statut vers le renderer.
  wireDownloaded(getWin, () => reportError);

  // Un build posé s'INSTALLE TOUT SEUL quand l'app est en arrière-plan prolongé ou que
  // l'utilisateur est parti — le modal reste le chemin nominal, ceci rattrape l'app
  // ouverte des jours que personne ne redémarre. Gardes + fail-closed : `autoInstall.ts`.
  startAutoInstall(getWin, { mainBusy: hooks?.mainBusy ?? (() => false) });

  autoUpdater.on("error", (err) => {
    logUpdateError("auto-update", err);
    // Surface the space-exhaustion case as a clear dialog even outside Settings (the
    // download itself can ENOSPC before the apply pre-check ever runs).
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

  // Check on launch AND every few hours after it (`poll.ts` owns both, and the pref
  // gate): downloads, then prompts (dialog above + a renderer status event so the
  // settings UI reflects it live). Auto-update off ⇒ neither; manual from Settings.
  startUpdateChecks();
}
