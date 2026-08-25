/**
 * This device's sync identity: a stable, non-hardware random id + a friendly
 * name (a user-set one wins over the auto default) + the TOFU secret. The
 * secret is registered HASHED server-side at first registration and later
 * exchanged for the short-lived device token that authenticates record calls
 * (a bare device id is enumerable via the device list; the secret is not).
 *
 * ⚠️ **Le SECRET vit dans le magasin chiffré du processus principal**, pas dans le
 * localStorage : c'est lui qui prouve l'identité de l'appareil, donc ce qui ferme
 * l'usurpation de replica, et le localStorage de Chromium est du LevelDB en clair sur le
 * disque. La phrase avait déjà déménagé ; le secret était resté, ce qui mettait
 * l'asymétrie exactement à l'envers de son rôle.
 *
 * L'ID, lui, RESTE en localStorage à dessein : ce n'est pas un secret (le serveur le
 * publie dans la liste des appareils), et le déplacer inventerait un nouvel appareil à
 * chaque profil — c'est déjà ce qui crée les doublons de la liste.
 */
import type { DeviceIdentity } from "@openmasq/sync";
import { BRAND } from "@openmasq/branding";

const DEVICE_ID_KEY = `${BRAND.slug}:sync-device-id`;
const DEVICE_NAME_KEY = `${BRAND.slug}:sync-device-name`;
/** L'ancien emplacement du secret, EN CLAIR. Lu une fois, puis effacé. */
const LEGACY_SECRET_KEY = `${BRAND.slug}:sync-device-secret`;

/**
 * Le secret TOFU de cet appareil, créé à la première demande.
 *
 * ⚠️ La migration n'est pas un confort : sans elle, un appareil déjà enregistré
 * repartirait avec un secret neuf que le serveur refuserait (le hash stocké est celui de
 * la PREMIÈRE inscription, jamais réécrit) — sa synchro serait morte, et l'utilisateur
 * n'aurait aucun moyen de le comprendre.
 */
export async function deviceSecret(): Promise<string> {
  // ⚠️ Le pont peut être ABSENT (preload non redémarré en dev, aperçu navigateur). On
  // dégrade vers l'ancien emplacement au lieu de jeter : une exception ici ferait échouer
  // `deviceIdentity()`, donc l'inscription, donc TOUTE la synchro — en silence.
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

  // Migration ponctuelle : l'ancien secret EN CLAIR est adopté tel quel puis effacé. Sans
  // elle, un appareil déjà inscrit repartirait avec un secret neuf que le serveur
  // refuserait — le hash stocké est celui de la PREMIÈRE inscription, jamais réécrit — et
  // sa synchro mourrait sans que rien ne l'explique.
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

/** L'id seul, SYNCHRONE : il n'est pas secret (le serveur le publie dans la liste des
 *  appareils), et le rendre asynchrone aurait contaminé tout le transport pour rien. */
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
