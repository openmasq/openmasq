import { useCallback, useEffect, useState } from "react";
import { useHost } from "../../../host";
import type {
  UpdateStatus,
  UpdatesCurrent,
  DesktopRelease,
  DesktopChannelReleases,
} from "../../../host";
import { useAppDispatch, useAppSelector } from "../../../state/redux";
import { selectUpdatesCache } from "../../../state/settingsCache";
import { loadUpdates } from "../../../state/settingsPrefetch";

// Logic for the updates settings section: current install identity, the list of
// published releases (from the updates Worker), and the live status stream from
// electron-updater. Presentation lives in UpdatesSection.tsx.
export interface UseUpdates {
  available: boolean;
  current: UpdatesCurrent | null;
  releases: DesktopRelease[];
  status: UpdateStatus | null;
  loading: boolean;
  error: string | null;
  /** Whether this install may pin/roll back to an exact version. Operator-
   *  granted (host.updates.permissions); defaults to true when the host doesn't
   *  expose the capability (older preload) so behaviour is unchanged there. */
  canPin: boolean;
  /** Privileged cross-environment view: the staging + production channels with
   *  their releases. Empty unless the device is permitted AND the host exposes
   *  `listAll` — then the picker offers switching between environments. */
  allChannels: DesktopChannelReleases[];
  crossEnv: boolean;
  refresh: () => void;
  check: () => void;
  pin: (version: string) => void;
  /** Switch this install to an exact build on another env's channel (reinstall). */
  switchTo: (channel: string, version: string) => void;
  install: () => void;
}

export function useUpdates(): UseUpdates {
  const host = useHost();
  const updates = host.updates;
  const dispatch = useAppDispatch();
  // The install identity / releases / permissions are fetched ONCE on Settings
  // arrival (`settingsPrefetch`) and live in Redux; this hook reads that cache.
  const cache = useAppSelector(selectUpdatesCache);
  // The live electron-updater status is a running subscription, not a cached
  // snapshot — it stays local.
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  const refresh = useCallback(() => {
    void loadUpdates(host, dispatch);
  }, [host, dispatch]);

  useEffect(() => {
    if (!updates) return;
    return updates.onStatus(setStatus);
  }, [updates]);

  const check = useCallback(() => {
    void updates?.check().catch(() => {});
  }, [updates]);

  const pin = useCallback(
    (version: string) => {
      void updates?.pin(version).catch(() => {});
    },
    [updates],
  );

  const install = useCallback(() => {
    void updates?.install().catch(() => {});
  }, [updates]);

  const switchTo = useCallback(
    (channel: string, version: string) => {
      void updates?.switchTo?.({ channel, version }).catch(() => {});
    },
    [updates],
  );

  return {
    available: !!updates,
    current: cache.current,
    releases: cache.releases,
    status,
    loading: !cache.loaded,
    error: cache.error,
    canPin: cache.canPin,
    allChannels: cache.allChannels,
    crossEnv: cache.crossEnv,
    refresh,
    check,
    pin,
    switchTo,
    install,
  };
}

/** Ensure the RUNNING build appears in the history list so its release note is
 *  visible even when the update channel's feed has no published build for it — a
 *  dev build (default channel `desktop-production`, often empty), or any channel
 *  whose `/releases` doesn't list this exact version. Prepends a minimal synthetic
 *  release for `currentVersion` when no EXACT-version row already exists (so a real
 *  published row for the same version is never duplicated). The note attaches to it
 *  via `noteLookup` exactly like a real row. */
export function ensureCurrentInReleases(
  releases: DesktopRelease[],
  currentVersion?: string,
): DesktopRelease[] {
  if (!currentVersion) return releases;
  if (releases.some((r) => r.version === currentVersion)) return releases;
  return [{ version: currentVersion }, ...releases];
}

// Numeric semver-lite compare (major.minor.patch), pre-release/build stripped.
// Returns <0 if a<b, 0 if equal, >0 if a>b. Used to flag a pin as a downgrade.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .split(/[.\-+]/)
      .slice(0, 3)
      .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
