/**
 * Device identification shared by BOTH REST transports (`http.ts` — personal
 * channels — and `orgHttp.ts` — org scopes): the minted device TOKEN when a
 * TOFU secret exists (capability signed, id-spoof-proof), else the bare id.
 * One home (rule 9) for the mint cache AND its cool-down.
 *
 * ⚠️ Le cache du jeton a DEUX faces : le succès ET l'échec. Un backend qui ne
 * peut pas signer (secret absent ⇒ 503 fermé volontairement) était redemandé à
 * chaque appel — 44 erreurs serveur en deux jours. Le repli sur l'identifiant
 * nu garde la synchro vivante, donc la frappe attend (30 s → 15 min ; un
 * 401/403 part directement au palier haut : un refus ne se répare pas en
 * réessayant). Épinglé par `http.test.ts`.
 */
import { brandHeader } from "@openmasq/branding";

/** How long to wait before asking for a device token again, per consecutive
 *  failure. Bounded and short: the mint is how a device proves its CAPABILITY,
 *  so a recovering backend must be picked up within minutes, not hours. */
const MINT_BACKOFF_S = [30, 60, 120, 300, 900];
const mintBackoffS = (failures: number): number =>
  MINT_BACKOFF_S[Math.min(failures, MINT_BACKOFF_S.length) - 1];

export interface DeviceAuthOptions {
  getDeviceId?: () => string | null;
  /** ⚠️ Peut rendre une PROMESSE : sur le bureau le secret vit dans le magasin
   *  chiffré du processus principal, pas en mémoire du renderer. */
  getDeviceSecret?: () => string | null | Promise<string | null>;
  /** POST the mint call. Throws with a `status` on an HTTP failure (the
   *  transport's `call` does) — a 401/403 is a refusal, the rest a hiccup. */
  mint: (deviceId: string, secret: string) => Promise<{ token: string; expiresIn: number } | null>;
}

export interface DeviceAuth {
  deviceHeaders(): Promise<Record<string, string>>;
}

/** Per-TRANSPORT state (never module-level: two accounts / two transports must
 *  not share a capability token). */
export function createDeviceAuth(opts: DeviceAuthOptions): DeviceAuth {
  let tokenCache: { token: string; exp: number } | null = null;
  let mintBlockedUntilS = 0;
  let mintFailures = 0;

  async function deviceToken(deviceId: string, secret: string): Promise<string | null> {
    const nowS = Math.floor(Date.now() / 1000);
    if (tokenCache && tokenCache.exp - 60 > nowS) return tokenCache.token;
    if (nowS < mintBlockedUntilS) return null; // cooling down → bare id, no call
    try {
      const out = await opts.mint(deviceId, secret);
      if (!out?.token) {
        mintBlockedUntilS = nowS + mintBackoffS(++mintFailures);
        return null;
      }
      mintFailures = 0;
      tokenCache = { token: out.token, exp: nowS + (out.expiresIn ?? 3600) };
      return tokenCache.token;
    } catch (err) {
      // A REFUSAL (this device may not mint: unknown id, wrong secret,
      // signed-out) cannot be fixed by asking again — go straight to the
      // longest wait. Anything else is a hiccup (5xx, offline) and climbs.
      const status = (err as { status?: number } | null)?.status;
      const refused = status === 401 || status === 403;
      mintFailures = refused ? MINT_BACKOFF_S.length : mintFailures + 1;
      mintBlockedUntilS = nowS + mintBackoffS(mintFailures);
      return null; // older backend / offline / refused → the bare-id fallback
    }
  }

  return {
    async deviceHeaders(): Promise<Record<string, string>> {
      const id = opts.getDeviceId?.();
      if (!id) return {};
      const secret = await opts.getDeviceSecret?.();
      if (secret) {
        const token = await deviceToken(id, secret);
        if (token) return { [brandHeader("device-token")]: token };
      }
      return { [brandHeader("device-id")]: id };
    },
  };
}
