import { app } from "electron";
import { closeSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logUpdate, logUpdateError } from "./log";
import { BRAND } from "@openmasq/branding";

// Detect a FAILED ShipIt (Squirrel.Mac) install on the NEXT launch and report it.
//
// A ShipIt swap failure (e.g. "App Still Running Error", SQRLInstaller Code=-9) happens
// in the SEPARATE ShipIt helper process AFTER our app has already quit for the update —
// so electron-updater never emits it and no in-process `error` hook can see it. The only
// trace is ShipIt's own stderr log. This reads that log on launch, decides whether the
// LAST install attempt failed, and (once per distinct failure) routes it into the same
// `$exception` telemetry channel as every other main-process error.

// The macOS app bundle id (electron-builder.cjs `appId`). ShipIt keys its cache dir on it.
const BUNDLE_ID = BRAND.desktopBundleId;

/** `~/Library/Caches/<bundleId>.ShipIt/ShipIt_stderr.log` — where Squirrel.Mac logs. */
function shipItLogPath(): string {
  return join(homedir(), "Library", "Caches", `${BUNDLE_ID}.ShipIt`, "ShipIt_stderr.log");
}

/** Marker holding the timestamp of the last failure we already reported (dedup). */
function reportedMarkerPath(): string {
  return join(app.getPath("userData"), "updates-shipit-reported");
}

/** Read at most the last `maxBytes` of a (possibly large) log file. */
function tail(path: string, maxBytes = 64 * 1024): string {
  const size = statSync(path).size;
  if (size <= maxBytes) return readFileSync(path, "utf8");
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    readSync(fd, buf, 0, maxBytes, size - maxBytes);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export interface ShipItFailure {
  /** Stable code, e.g. "-9" (SQRLInstaller) or "instances" (aborted on running count). */
  code: string;
  /** Running-instance count if the abort named one. */
  instances?: number;
  /** The failing line's ShipIt timestamp — the natural per-attempt dedup key. */
  at: string;
}

// A ShipIt line is prefixed `YYYY-MM-DD HH:MM:SS.mmm ShipIt[…] <message>`.
const TS = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)/;

/**
 * Parse the ShipIt stderr log and return the LAST install attempt's failure, or null if
 * the last outcome was a success (or there's no log / no decisive outcome). Pure over the
 * log text so it's unit-testable without a real ShipIt run.
 */
export function parseShipItFailure(log: string): ShipItFailure | null {
  const lines = log.split("\n");
  let lastSuccessIdx = -1;
  let lastFailIdx = -1;
  let failCode = "";
  let instances: number | undefined;
  let failAt = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Installation completed successfully/.test(line)) lastSuccessIdx = i;
    const code = /SQRLInstallerErrorDomain Code=(-?\d+)/.exec(line);
    const abort = /Aborting update attempt because there are (\d+) running instances/.exec(line);
    if (code || /Installation cancelled/.test(line) || abort) {
      lastFailIdx = i;
      failAt = TS.exec(line)?.[1] ?? failAt;
      if (code) failCode = code[1];
      if (abort) instances = Number(abort[1]);
    }
  }
  // No failure, or a later success supersedes the failure → nothing to report.
  if (lastFailIdx < 0 || lastSuccessIdx > lastFailIdx) return null;
  return { code: failCode || (instances != null ? "instances" : "unknown"), instances, at: failAt };
}

/**
 * On launch (macOS packaged only), report a failed ShipIt install once. `reportError`
 * is injected (→ `reportMainError`) so this module stays free of the error bridge.
 */
export function detectAndReportShipItFailure(reportError: (code: string, err: unknown) => void): void {
  if (process.platform !== "darwin" || !app.isPackaged) return;
  let failure: ShipItFailure | null = null;
  try {
    failure = parseShipItFailure(tail(shipItLogPath()));
  } catch {
    return; // no log / unreadable → nothing to do
  }
  if (!failure) return;

  // Dedup on the failing line's timestamp so we report each distinct attempt once.
  let alreadyReported = "";
  try {
    alreadyReported = readFileSync(reportedMarkerPath(), "utf8").trim();
  } catch {
    /* no marker yet */
  }
  if (failure.at && failure.at === alreadyReported) return;

  const detail = `ShipIt install failed (Code=${failure.code}${
    failure.instances != null ? `, ${failure.instances} running instances` : ""
  })`;
  const err = new Error(detail);
  err.name = "ShipItInstallError";
  reportError(`shipit-${failure.code}`, err);
  logUpdate(`reported prior ShipIt failure: ${detail} @ ${failure.at || "?"}`);

  try {
    writeFileSync(reportedMarkerPath(), failure.at || detail);
  } catch (e) {
    logUpdateError("shipit-marker-write", e);
  }
}
