/**
 * Desktop binding for `@openmasq/sync`. Best-effort: no passphrase or signed
 * out → silent no-op. The backend origin defaults to the deployed production
 * origin (below), overridable at build time via `VITE_BACKEND_URL` (e.g. staging).
 *
 * Cross-device KEY = the conversation id (`conv.id`), matching `apps/mobile`. The
 * vault is E2E-encrypted with the user's passphrase before upload; sync is opt-in
 * (no passphrase ⇒ no-op). NOTE: a conversation id is a per-device local uid, so a
 * remote vault only MERGES back on a device that holds the same conversation id —
 * push/pull is still safe (encrypted, deduped) but is not a cross-device restore on
 * its own. (The former keyless web-session thread id, the only id shared across
 * devices, was removed with the keyless mode — that path now lives in the extension.)
 */
import Debug from "debug"; import { BRAND } from "@openmasq/branding";
import {
  createRecordSync,
  isCryptoFailure,
  createVaultSync,
  httpTransport,
  verifyPassphrase,
  type PassphraseVerdict,
  type AuditSource,
  type DeviceInfo,
  type HttpTransportOptions,
  type OrgProfile,
  type RecordSync,
  type RecordTransport,
  type SyncTransport,
  type VaultPayload,
  type VaultSync,
} from "@openmasq/sync";
import { captureError } from "@openmasq/ui";
import type { Conversation } from "@openmasq/ui";
import { authHost } from "../auth";
import { backendFetch } from "../backendFetch";
import { deviceId, deviceIdentity, deviceSecret, storeDeviceName } from "./device";
import { getSyncPassphrase } from "./passphrase";
import { openReported } from "./reported";
import { recordCryptoFailure, withExchangeWitness } from "./status";
import { BACKEND_URL } from "../appEnv";

// Enable with `localStorage.debug = "openmasq:*"`. Privacy: NEVER log vault
// originals/placeholders, kinds, titles or ciphertext — only counts, booleans,
// thread-key presence, device ids, and operation names.
const debug = Debug("openmasq:sync");

// Same Vercel origin serves the SPA AND `/api-features/*` (root vercel.json).
// L'origine et son défaut vivent dans `../appEnv` (LE seul lecteur d'import.meta.env).
const BASE_URL = BACKEND_URL;

/** Whether a sync backend origin is available (true given the default above). */
export const SYNC_ENABLED = !!BASE_URL;

/** Rename this device: persist the name locally (so future heartbeats keep it)
 *  and re-register immediately so the change shows at once. */
export async function setDeviceName(name: string): Promise<void> {
  debug("setDeviceName (length=%d) → re-register", name?.length ?? 0);
  storeDeviceName(name);
  await registerDevice();
}

// Last-known-good org profile in localStorage, so the Organisation tab +
// enforcement survive a backend outage instead of collapsing to solo. @openmasq/
// sync reads/writes it via the `orgCache` option: it returns the cached value when
// the backend is UNREACHABLE, and CLEARS it on a reachable "no org" / sign-out.
// ⚠️ SCOPÉ AU COMPTE. La clé était nue (`<slug>:org-profile`) : sur une machine
// partagée, le compte B héritait de la politique du compte A dès que sa propre lecture
// échouait — donc de contraintes qui ne le concernent pas, ou de l'absence des siennes
// (audit 14/08). `setOrgCacheUser` est appelée aux mêmes moments que `keys.setUser` /
// `db.setUser` : la portée d'un compte est une seule opération.
const ORG_PROFILE_KEY = `${BRAND.slug}:org-profile`;
let orgCacheUid: string | null = null;
const orgKey = (): string | null => (orgCacheUid ? `${ORG_PROFILE_KEY}:${orgCacheUid}` : null);

/** Re-scoper le cache de politique sur le compte connecté (`null` = déconnecté). */
export function setOrgCacheUser(uid: string | null): void {
  orgCacheUid = uid;
}

const orgCache = {
  get(): OrgProfile | null {
    try {
      const k = orgKey();
      const raw = k ? localStorage.getItem(k) : null;
      return raw ? (JSON.parse(raw) as OrgProfile) : null;
    } catch {
      return null;
    }
  },
  set(profile: OrgProfile | null) {
    try {
      const k = orgKey();
      if (!k) return; // déconnecté : rien à mémoriser pour personne
      if (profile) localStorage.setItem(k, JSON.stringify(profile));
      else localStorage.removeItem(k);
    } catch {
      /* localStorage unavailable — the cache is best-effort. */
    }
  },
};

// Anonymised error-tracking shared by every channel (`orgScopeSync.ts` included).
// `where` can carry an org uuid suffix — stripped so `code` stays bounded.
export function reportSyncError(where: string, err: unknown): void {
  debug("transport error @ %s: %s", where, err instanceof Error ? err.message : err);
  // ⚠️ Une panne de DÉCHIFFREMENT réussit côté HTTP, donc le témoin du transport la
  // manque et annonce « dernier échange réussi » sur une synchro morte. On la lui donne
  // ici — c'est le seul endroit qui voit l'erreur elle-même.
  if (isCryptoFailure(err)) {
    recordCryptoFailure("la phrase secrète de cet appareil n’ouvre pas les données synchronisées");
  }
  captureError({
    scope: "sync",
    code: where.replace(/:[0-9a-f-]{8,}.*$/i, ""),
    name: err instanceof Error ? err.name : undefined,
    message: err instanceof Error ? err.message : String(err),
  });
}

// ONE set of REST options for every channel transport (vault/record here, the org
// channel in `orgScopeSync.ts`) — a second hand-wired copy is what rule 9 forbids.
export function transportOptions(): HttpTransportOptions | null {
  if (!BASE_URL) return null;
  return {
    baseUrl: BASE_URL,
    // getAccessToken is optional on the Host auth surface (absent in the
    // browser preview) — treat a missing one as signed-out (→ no-op).
    getToken: async () => (await authHost.getAccessToken?.()) ?? null,
    getDeviceId: deviceId,
    getDeviceSecret: () => deviceSecret(),
    // Carry the Vercel deployment-protection bypass on the STAGING backend
    // (no-op in prod, which isn't protected) so sync/org calls aren't SSO-walled.
    // Le témoin observe chaque issue (Réglages → Synchronisation) — la réponse
    // repart intacte, le contrat best-effort ne change pas.
    fetch: withExchangeWitness(backendFetch),
  };
}

// ONE transport for the vault channel AND the record channel (v2). The record
// endpoints require the device header — the backend keys its direction
// capability on it (this device registers as `platform:"desktop"` → replica).
let transportCached: (SyncTransport & RecordTransport) | null | undefined;
function transport(): (SyncTransport & RecordTransport) | null {
  if (transportCached !== undefined) return transportCached;
  const opts = transportOptions();
  transportCached = opts ? httpTransport(opts) : null;
  return transportCached;
}

let cached: VaultSync | null | undefined;
function sync(): VaultSync | null {
  if (cached !== undefined) return cached;
  const t = transport();
  cached = t
    ? createVaultSync({
        transport: t,
        getPassphrase: getSyncPassphrase,
        getDevice: deviceIdentity,
        orgCache,
        onError: reportSyncError,
      })
    : null;
  debug("sync client %s (backend=%s)", cached ? "created" : "disabled", BASE_URL ? "set" : "none");
  return cached;
}

// The record channel (conversations + integrations directory), same transport,
// same passphrase, same best-effort contract.
let recordsCached: RecordSync | null | undefined;
export function recordSync(): RecordSync | null {
  if (recordsCached !== undefined) return recordsCached;
  const t = transport();
  recordsCached = t
    ? createRecordSync({ transport: t, getPassphrase: getSyncPassphrase, onError: reportSyncError })
    : null;
  debug("record sync client %s", recordsCached ? "created" : "disabled");
  return recordsCached;
}

/** Confronter une phrase aux enveloppes déjà stockées côté serveur (Réglages → sync) —
 *  le signal immédiat qui manquait le 14/08 quand deux appareils divergeaient. */
export async function checkPassphrase(p: string): Promise<PassphraseVerdict> {
  const t = transport();
  return t ? verifyPassphrase(t, p) : "unreachable";
}

/** This device's stable sync id (for the record ledger / Lamport identity). */
export function syncDeviceId(): string {
  return deviceId();
}

/** Register/heartbeat this device in the account's device list. */
export async function registerDevice(): Promise<void> {
  debug("registerDevice");
  await sync()?.registerDevice();
  debug("registerDevice done");
}

/** The account's connected devices (empty when sync is off / signed out). */
export async function listDevices(): Promise<DeviceInfo[]> {
  const devices = (await sync()?.listDevices()) ?? [];
  debug("listDevices → %d device(s)", devices.length);
  return devices;
}

/** Forget a device by id. */
export async function revokeDevice(deviceId: string): Promise<void> {
  debug("revokeDevice %s", deviceId);
  await sync()?.revokeDevice(deviceId);
}

/** The signed-in member's consolidated org authorization (membership/role +
 *  allowed-models & mandated-redaction policy), or null (solo / signed out /
 *  backend off). Best-effort — powers Host.org, which the UI reflects + enforces. */
export async function getOrgProfile(): Promise<OrgProfile | null> {
  const profile = (await sync()?.getOrgProfile()) ?? null;
  debug("getOrgProfile → %s", profile ? "profile present" : "null (solo/signed out)");
  return profile;
}

/** The cross-device sync key for a conversation (its id), or null if unset. */
function syncKey(conv: Conversation): string | null {
  return conv.id || null;
}

function toPayload(c: Conversation): VaultPayload {
  return {
    redactionVault: c.redactionVault ?? {},
    redactionKinds: c.redactionKinds ?? {},
    title: c.title,
    modelId: c.modelId,
    updatedAt: c.updatedAt,
  };
}

/** Encrypt + upload a conversation's vault (E2E, keyed on its id). */
export async function pushConv(conv: Conversation): Promise<void> {
  const key = syncKey(conv);
  if (!key) {
    debug("pushConv skipped (no sync key)");
    return;
  }
  debug("pushConv key=present vaultEntries=%d", Object.keys(conv.redactionVault ?? {}).length);
  await sync()?.push(key, toPayload(conv));
  debug("pushConv done");
}

/** Pull + decrypt + merge a conversation's remote vault. Returns the merged maps
 *  for the caller to apply via the store, or null when there's nothing to merge. */
export async function pullConv(
  conv: Conversation,
): Promise<{ vault: Record<string, string>; kinds: Record<string, string> } | null> {
  const key = syncKey(conv);
  const s = sync();
  if (!key || !s) {
    debug("pullConv skipped (key=%s sync=%s)", key ? "present" : "none", s ? "on" : "off");
    return null;
  }
  const merged = await s.pull(key, toPayload(conv));
  if (!merged) {
    debug("pullConv → nothing to merge");
    return null;
  }
  debug("pullConv → merged vaultEntries=%d", Object.keys(merged.redactionVault ?? {}).length);
  return { vault: merged.redactionVault, kinds: merged.redactionKinds ?? {} };
}

/** Report the DELTA of new redactions (counts only) across all conversations to
 *  the user's org(s), deduped against the persisted reported-set. */
export async function reportAudit(convs: Conversation[]): Promise<void> {
  const s = sync();
  if (!s) {
    debug("reportAudit skipped (sync off)");
    return;
  }
  const reported = await openReported();
  const sources: AuditSource[] = [];
  const fresh: string[] = [];
  for (const c of convs) {
    const vault: Record<string, string> = {};
    const kinds: Record<string, string> = {};
    for (const [placeholder, original] of Object.entries(c.redactionVault ?? {})) {
      // `seen` compare des EMPREINTES : le journal ne détient plus les valeurs.
      if (!original || (await reported.seen(original))) continue;
      vault[placeholder] = original;
      kinds[original] = c.redactionKinds?.[original] ?? "secret";
      fresh.push(original);
    }
    if (Object.keys(vault).length) sources.push({ redactionVault: vault, redactionKinds: kinds, modelId: c.modelId });
  }
  if (!fresh.length) {
    debug("reportAudit → no fresh redactions to report (%d convs scanned)", convs.length);
    return;
  }
  debug("reportAudit → reporting %d fresh redaction(s) from %d source(s)", fresh.length, sources.length);
  const sent = await s.reportOrgAudit(sources);
  debug("reportAudit → %d sent", sent);
  if (sent > 0) await reported.mark(fresh);
}
