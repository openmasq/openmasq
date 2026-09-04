import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import electronUpdater from "electron-updater";

// electron-updater is CommonJS; destructure after a default import.
const { autoUpdater } = electronUpdater;

// Main is CJS (it uses `__dirname`), so no `import.meta`: the address arrives
// via an electron-vite define. ⚠️ **No committed default** — same rule as the
// other services (`src/environments/index.ts`): a public repo whose build
// fell back to the brand's feed would make every fork update WITH
// SOMEONE ELSE'S BINARY, signed by someone else. Empty ⇒ no automatic
// updates at all (`UPDATES_CONFIGURED`), and the app says so rather than
// probing into the void.
// ⚠️ A non-dev build DOES receive a default now: `scripts/publicServices.ts`
// lists `VITE_UPDATES_URL` among the public services, so a build from these
// sources polls the brand's feed unless it is set — including to the empty
// string, which is the documented opt-out (`SELF_HOSTING.md`). A fork that
// ships under its own identity must set or empty it.
export const UPDATES_URL = (process.env.VITE_UPDATES_URL || "").replace(/\/+$/, "");

/** Does this build have an update feed? Empty = no, and that's a NORMAL state
 *  (local build, self-hosted fork) — never an error to report. */
export const UPDATES_CONFIGURED = !!UPDATES_URL;

// The channel baked at build time (electron.vite.config.ts define): the DEFAULT for the first
// launch, nothing else. CI bakes `desktop-stable` into EVERY build published by tag —
// promotion copies the bytes, so this literal travels with them, and a baked `desktop-beta`
// enrolled every fresh install from the landing page's .dmg into beta (08/14). Being in beta
// is an ACT: `allow_self_pin` + the in-app switch, persisted here — and an existing
// `updates.json` always wins over the baked value.
export const DEFAULT_CHANNEL = process.env.VITE_UPDATES_CHANNEL || "desktop-stable";

/** The desktop channels that exist server-side. An ALLOW-list, because the target
 *  comes from the renderer: an unknown value used to be persisted verbatim and
 *  pointed the feed at `<worker>/desktop/<whatever>`.
 *  The PUBLIC names (beta/stable — single artifact: the channel says which BUILDS we
 *  receive, not which environment) AND the historical names, which existing installs
 *  still persist — the Worker aliases both to the same lines
 *  (`apps/updates/src/lib/desktopChannels.ts`). */
const KNOWN_CHANNELS = new Set([
  "desktop-beta",
  "desktop-stable",
  "desktop-staging",
  "desktop-production",
]);

/** …plus whatever channel THIS build was baked with. A dry-run build ships a
 *  channel that deliberately doesn't exist server-side (`desktop-winci`), and it
 *  must still be able to keep — and return to — its own.
 *
 *  It lives HERE rather than beside `classifyChannelChange` because BOTH ways a channel
 *  enters this process must pass it: the renderer's `updates:set-channel`, and the value
 *  read back out of `updates.json` at every launch (see `loadConfig`). */
export const channelAllowed = (c: string): boolean =>
  KNOWN_CHANNELS.has(c) || c === DEFAULT_CHANNEL;

// Channels that predate the current naming. "latest" predates channels entirely; the two
// env-shaped names (desktop-staging/desktop-production) predate the beta/stable rename and
// are STILL SERVED by the Worker as aliases, so they are NOT listed here — an install that
// persists one keeps updating. Only a channel that no longer serves releases belongs in this
// set: a persisted value must not win over the baked one when the feed would 404.
const LEGACY_CHANNELS = new Set(["latest"]);

// ⛔ NO `autoUpdate` preference here, and this is not an oversight. Updates are
// ALWAYS automatic: the only use of the setting we used to offer was staying on an
// old version, i.e. keeping defaults that were already fixed — the redaction ones
// included, on the path of every send. An `autoUpdate` key left over in a previous
// `updates.json` is simply ignored (it's no longer read): nothing to migrate, and the install that
// had it set to `false` goes back to automatic on the next launch.
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
      // A stale legacy channel ("latest") falls back to this build's baked channel — and so
      // does anything the ALLOW-LIST doesn't know. `updates.json` sits in `userData`, a plain
      // editable file: without this, any string in it was persisted verbatim and interpolated
      // into the update feed PATH by `feedBase`, i.e. it chose which manifest this signed app
      // asks for its next binary. The IPC path has gated on `channelAllowed` all along; the
      // persisted path is the same value arriving by another door (rule 7).
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
