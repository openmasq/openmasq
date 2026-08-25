import { app } from "electron";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

// A tiny file logger for the auto-updater (no extra dependency). electron-updater
// otherwise logs only to console/stderr — invisible on a packaged build launched from
// Finder — so the true reason a `quitAndInstall` failed (a ShipIt swap/relaunch error)
// never surfaced anywhere the user or support could read it. This writes a bounded,
// rotated log next to the app data. It carries version / channel / status / feed URL
// only — NEVER a secret, PII, or a provider key (the updater never sees those).

const MAX_BYTES = 1_000_000; // rotate at ~1 MB (one previous file kept)

function logFile(): string {
  return join(app.getPath("userData"), "logs", "updater.log");
}

/** Le chemin du journal de mise à jour — pour le bouton « Révéler » de Réglages →
 *  Versions (`updates:reveal-log`) : la seule surface où la vraie raison d'un
 *  `quitAndInstall` atterrit était un fichier qu'aucune UI n'atteignait (audit 13/08). */
export function updaterLogPath(): string {
  return logFile();
}

function fmt(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args.map(fmt).join(" ")}\n`;
  try {
    const f = logFile();
    mkdirSync(dirname(f), { recursive: true });
    try {
      if (statSync(f).size > MAX_BYTES) renameSync(f, `${f}.1`);
    } catch {
      /* no existing file / rotate best-effort */
    }
    appendFileSync(f, line);
  } catch {
    /* logging must never break the updater */
  }
  // Mirror to the console too (visible when launched from a terminal).
  (console[level as "info" | "warn" | "error"] ?? console.log)(`[updates] ${args.map(fmt).join(" ")}`);
}

/** A logger object shaped for `autoUpdater.logger` (info/warn/error/debug). */
export const updaterLogger = {
  info: (...a: unknown[]): void => write("info", a),
  warn: (...a: unknown[]): void => write("warn", a),
  error: (...a: unknown[]): void => write("error", a),
  debug: (...a: unknown[]): void => write("debug", a),
};

export function logUpdate(...args: unknown[]): void {
  write("info", args);
}
export function logUpdateError(scope: string, err: unknown): void {
  write("error", [scope, err]);
}
