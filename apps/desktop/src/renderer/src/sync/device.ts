/**
 * This device's sync identity: a stable, non-hardware random id + a friendly
 * name (a user-set one wins over the auto default) + the TOFU secret. The
 * secret is registered HASHED server-side at first registration and later
 * exchanged for the short-lived device token that authenticates record calls
 * (a bare device id is enumerable via the device list; the secret is not).
 *
 * ⚠️ **The SECRET lives in the main process's encrypted store**, not in
 * localStorage: it's what proves the device's identity, so what closes off
 * replica impersonation, and Chromium's localStorage is plaintext LevelDB on
 * disk. The passphrase had already moved; the secret had stayed behind, which put
 * the asymmetry exactly backwards from its role.
 *
 * The ID, though, STAYS in localStorage on purpose: it's not a secret (the server
 * publishes it in the device list), and moving it would invent a new device on
 * every profile — that's already what creates the list's duplicates.
 */
import type { DeviceIdentity } from "@openmasq/sync";
import { BRAND } from "@openmasq/branding";

const DEVICE_ID_KEY = `${BRAND.slug}:sync-device-id`;
const DEVICE_NAME_KEY = `${BRAND.slug}:sync-device-name`;
/** The old location of the secret, IN PLAINTEXT. Read once, then erased. */
const LEGACY_SECRET_KEY = `${BRAND.slug}:sync-device-secret`;

/**
 * This device's TOFU secret, created on first request.
 *
 * ⚠️ The migration isn't a nicety: without it, an already-registered device
 * would start over with a fresh secret the server would refuse (the stored hash is that of
 * the FIRST registration, never rewritten) — its sync would be dead, and the user
 * would have no way to understand why.
 */
export async function deviceSecret(): Promise<string> {
  // ⚠️ The bridge can be ABSENT (preload not restarted in dev, browser preview). We
  // degrade to the old location instead of throwing: an exception here would fail
  // `deviceIdentity()`, so registration, so ALL of sync — silently.
  const bridge = window.openmasq?.sync;
  const legacy = (): string | null => {
    try {
      return localStorage.getItem(LEGACY_SECRET_KEY);
    } catch {
      return null;
    }
  };
  const mint = () => crypto.randomUUID().replace(/-/g, "");

  if (!bridge?.getDeviceSecret || !bridge?.setDeviceSecret) {
    let s = legacy();
    if (!s) {
      s = mint();
      try {
        localStorage.setItem(LEGACY_SECRET_KEY, s);
      } catch {
        /* ignore */
      }
    }
    return s;
  }

  const stored = await bridge.getDeviceSecret();
  if (stored) return stored;

  // One-time migration: the old PLAINTEXT secret is adopted as-is then erased. Without
  // it, an already-registered device would start over with a fresh secret the server
  // would refuse — the stored hash is that of the FIRST registration, never rewritten — and
  // its sync would die with nothing to explain why.
  const s = legacy() ?? mint();
  await bridge.setDeviceSecret(s);
  try {
    localStorage.removeItem(LEGACY_SECRET_KEY);
  } catch {
    /* ignore */
  }
  return s;
}

function autoDeviceName(): string {
  const plat =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "";
  return plat ? `${BRAND.name} Desktop · ${plat}` : `${BRAND.name} Desktop`;
}

/** The id alone, SYNCHRONOUS: it isn't secret (the server publishes it in the
 *  device list), and making it async would have contaminated the whole transport for nothing. */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function deviceIdentity(): Promise<DeviceIdentity> {
  return {
    deviceId: deviceId(),
    name: localStorage.getItem(DEVICE_NAME_KEY) || autoDeviceName(),
    platform: "desktop",
    deviceSecret: await deviceSecret(),
  };
}

/** Persist a user-chosen device name (future heartbeats keep it). */
export function storeDeviceName(name: string): void {
  localStorage.setItem(DEVICE_NAME_KEY, name);
}
