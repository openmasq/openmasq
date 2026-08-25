import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import electronUpdater from "electron-updater";
import { brandUrl } from "@openmasq/branding";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

const DEFAULT_UPDATES_URL = brandUrl("updates");
// The main bundle is CJS (uses __dirname), so no import.meta — read the optional
// override from process.env (baked by electron-vite when set); else the default.
export const UPDATES_URL = (process.env.VITE_UPDATES_URL || DEFAULT_UPDATES_URL).replace(/\/+$/, "");

// Le canal baké au build (define d'electron.vite.config.ts) : le DÉFAUT du premier
// lancement, rien d'autre. La CI cuit `desktop-stable` dans TOUT build publié par tag —
// la promotion copie les octets, donc ce littéral voyage avec eux, et `desktop-beta` cuit
// enrôlait chaque install neuve du .dmg de la landing dans la bêta (14/08). Être en bêta
// est un ACTE : `allow_self_pin` + la bascule in-app, persistée ici — et un `updates.json`
// existant gagne toujours sur le baké.
export const DEFAULT_CHANNEL = process.env.VITE_UPDATES_CHANNEL || "desktop-production";

// Channels that predate the env-bound model (desktop-staging/desktop-production).
// A persisted "latest" from a pre-migration install must NOT win over the baked
// channel — that channel no longer serves releases (the feed 404s), so we treat
// it as stale and migrate the install to this build's environment channel.
const LEGACY_CHANNELS = new Set(["latest"]);

// ⛔ PAS de préférence `autoUpdate` ici, et ce n'est pas un oubli. La mise à jour est
// TOUJOURS automatique : le seul usage du réglage qu'on offrait était de rester sur une
// version ancienne, c'est-à-dire de garder des défauts déjà corrigés — ceux du redaction
// compris, sur le chemin de chaque envoi. Une clé `autoUpdate` restée dans un `updates.json`
// d'avant est simplement ignorée (elle n'est plus relue) : rien à migrer, et l'install qui
// l'avait à `false` repart automatique au prochain lancement.
export interface UpdatesConfig {
  channel: string;
  // Stable per-install id (the desktop analogue of a localStorage device id).
  // electron-updater's own staging id drives the stagingPercentage gate; this is
  // exposed to the renderer for support + future device targeting.
  installId: string;
  // The version this install was running at its LAST launch. A ShipIt swap completes
  // after we quit, so "did the update actually apply?" can only be answered by the next
  // launch comparing this against `app.getVersion()` (`track.ts`). Absent ⇒ first launch
  // ever, which is an INSTALL, not an update.
  lastVersion?: string;
  // The version handed to ShipIt by the last `quitAndInstall`, written to DISK rather
  // than reported there and then: the renderer (which owns the analytics transport) is
  // about to be destroyed, so an IPC-forwarded event would race the quit and be lost
  // exactly when it matters. Reported on the next launch instead (`track.ts`).
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
      // A stale legacy channel ("latest") falls back to this build's baked channel.
      channel: persisted && !LEGACY_CHANNELS.has(persisted) ? persisted : DEFAULT_CHANNEL,
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

// Encode the channel (audit L17): it's a renderer-suppliable value interpolated into
// the feed PATH — encode it like the version already is, so it can't inject path segments.
export const feedBase = (channel: string): string =>
  `${UPDATES_URL}/desktop/${encodeURIComponent(channel)}`;

// The stable per-install id, sent as `?device=` so the Worker can target this
// machine (tag-scoped rollouts) and enforce the self-pin permission server-side.
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
