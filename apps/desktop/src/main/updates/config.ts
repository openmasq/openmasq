import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import electronUpdater from "electron-updater";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

// Main is CJS: the address arrives via a define. Its default comes from
// `scripts/publicServices.ts`; a fork shipping under its own identity sets or EMPTIES it
// (`SELF_HOSTING.md`), because updating from someone else's feed means getting THEIR
// binary. Empty ⇒ no automatic updates, said rather than probed into the void.
export const UPDATES_URL = (process.env.VITE_UPDATES_URL || "").replace(/\/+$/, "");

/** Does this build have an update feed? Empty = no, and that's a NORMAL state
 *  (local build, self-hosted fork) — never an error to report. */
export const UPDATES_CONFIGURED = !!UPDATES_URL;

// The baked channel is the DEFAULT for the first launch, nothing else: promotion copies
// the bytes, so this literal travels with them. Being in beta is an ACT persisted here, and
// an existing `updates.json` always wins over the baked value.
export const DEFAULT_CHANNEL = process.env.VITE_UPDATES_CHANNEL || "desktop-stable";

/** The channels the feed serves. An ALLOW-list, because the target comes from the
 *  renderer. The PUBLIC names AND the historical ones existing installs still persist,
 *  which the feed aliases. */
const KNOWN_CHANNELS = new Set([
  "desktop-beta",
  "desktop-stable",
  "desktop-staging",
  "desktop-production",
]);

/** …plus whatever channel THIS build was baked with (a dry-run build ships one that
 *  doesn't exist server-side). HERE because BOTH doors a channel enters by must pass it:
 *  the renderer's `updates:set-channel` and the value read back from `updates.json`. */
export const channelAllowed = (c: string): boolean =>
  KNOWN_CHANNELS.has(c) || c === DEFAULT_CHANNEL;

// Only a channel the feed no longer serves belongs here: a persisted value must not win
// over the baked one when the feed would 404. The aliased historical names stay allowed.
const LEGACY_CHANNELS = new Set(["latest"]);

// ⛔ NO `autoUpdate` preference: updates are ALWAYS automatic (staying on an old version
// means keeping redaction defaults already fixed). A leftover key is ignored.
export interface UpdatesConfig {
  channel: string;
  // Stable per-install id, exposed to the renderer for support + device targeting.
  installId: string;
  // The version at the LAST launch: a swap completes after we quit, so "did it apply?" is
  // answered by the next launch (`track.ts`). Absent ⇒ first launch (an INSTALL).
  lastVersion?: string;
  // The version handed to the installer by the last `quitAndInstall`, written to DISK
  // because an IPC-forwarded event would race the quit. Reported on the next launch.
  pendingInstall?: string;
}

let config: UpdatesConfig = { channel: DEFAULT_CHANNEL, installId: "" };

/** The live updates config (read-only snapshot; mutate via `updateConfig`). */
export const getConfig = (): UpdatesConfig => config;

const configPath = (): string => join(app.getPath("userData"), "updates.json");

/** Load `updates.json` into the module state and return it (migrating stale channels). */
export function loadConfig(): UpdatesConfig {
  try {
    const raw = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<UpdatesConfig>;
    const persisted = typeof raw.channel === "string" && raw.channel ? raw.channel : "";
    const cfg: UpdatesConfig = {
      // A legacy channel, or anything the ALLOW-LIST doesn't know, falls back to the baked
      // channel: `updates.json` is a plain editable file, and its value is interpolated into
      // the feed PATH that chooses this signed app's next binary (rule 7).
      channel:
        persisted && !LEGACY_CHANNELS.has(persisted) && channelAllowed(persisted)
          ? persisted
          : DEFAULT_CHANNEL,
      installId: typeof raw.installId === "string" && raw.installId ? raw.installId : randomUUID(),
      ...(typeof raw.lastVersion === "string" && raw.lastVersion ? { lastVersion: raw.lastVersion } : {}),
      ...(typeof raw.pendingInstall === "string" && raw.pendingInstall
        ? { pendingInstall: raw.pendingInstall }
        : {}),
    };
    config = cfg;
    // Persist a migrated channel or a freshly-minted id.
    if (raw.channel !== cfg.channel || raw.installId !== cfg.installId) saveConfig(cfg);
    return cfg;
  } catch {
    const cfg: UpdatesConfig = { channel: DEFAULT_CHANNEL, installId: randomUUID() };
    config = cfg;
    saveConfig(cfg);
    return cfg;
  }
}

function saveConfig(cfg: UpdatesConfig): void {
  try {
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error("[updates] failed to persist updates.json:", err);
  }
}

/** Merge a patch into the live config, persist it, and return the new value. */
export function updateConfig(patch: Partial<UpdatesConfig>): UpdatesConfig {
  config = { ...config, ...patch };
  saveConfig(config);
  return config;
}

// The channel is a renderer-suppliable value interpolated into the feed PATH: encoded.
export const feedBase = (channel: string): string =>
  `${UPDATES_URL}/desktop/${encodeURIComponent(channel)}`;

// `?device=` lets the feed target this machine and enforce the self-pin permission.
export const deviceQuery = (): string =>
  config.installId ? `?device=${encodeURIComponent(config.installId)}` : "";

// The `channel` in setFeedURL is the manifest FILENAME prefix (→ latest-mac.yml);
// our logical channel lives in the URL path. Pinned feeds add /v/<version>.
export function applyFeed(channel: string, pinnedVersion?: string): void {
  const base = pinnedVersion
    ? `${feedBase(channel)}/v/${encodeURIComponent(pinnedVersion)}`
    : feedBase(channel);
  autoUpdater.setFeedURL({ provider: "generic", url: `${base}${deviceQuery()}`, channel: "latest" });
}
