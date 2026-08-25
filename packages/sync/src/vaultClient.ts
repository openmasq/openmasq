/**
 * The high-level sync client every surface calls. Stateless over an injected
 * {@link SyncTransport} + a passphrase provider. All methods are **best-effort**:
 * any failure (signed out, offline, wrong passphrase, server error) is swallowed
 * to a no-op/return-null so sync never blocks the user or corrupts local state.
 */
import { decryptVault, encryptVault } from "./crypto";
import { deriveRedactionEvents, type AuditSource } from "./events";
import { isVaultSubset, mergeVaultPayloads } from "./merge";
import type {
  DeviceIdentity,
  DeviceInfo,
  OrgProfile,
  OrgRef,
  CreditBalance,
  SyncTransport,
  VaultPayload,
} from "./types";

/** Read an org's mandated redaction policy out of its free-form settings JSONB,
 *  defensively (the blob is untyped server-side). */
function readRedactionPolicy(org: OrgRef): { forcedCategories: string[] } {
  const rp = org.organization_settings?.redactionPolicy;
  const forcedCategories = Array.isArray(rp?.forcedCategories)
    ? rp!.forcedCategories!.filter((x): x is string => typeof x === "string")
    : [];
  return { forcedCategories };
}

/** Intersection de deux ensembles — la consolidation MULTI-ORGANISATION d'une
 *  allow-list : ce que toutes autorisent, et rien de plus. */
function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((x) => b.has(x)));
}

export interface VaultSyncOptions {
  transport: SyncTransport;
  /** Returns the E2E passphrase, or null/undefined if the user hasn't set one
   *  (→ sync off). Kept async so a device can read it from secure storage. */
  getPassphrase: () => Promise<string | null | undefined> | string | null | undefined;
  /** This device's identity, for the connected-devices registry + heartbeat.
   *  Omit on surfaces without one (device methods then no-op). */
  getDevice?: () => Promise<DeviceIdentity | null> | DeviceIdentity | null;
  /** Optional log sink for diagnostics (never throws into the caller). */
  onError?: (where: string, err: unknown) => void;
  /** Optional last-known-good cache for the org profile. When the backend is
   *  UNREACHABLE, `getOrgProfile` returns the cached profile instead of null, so an
   *  org member keeps their Organisation tab + enforcement offline instead of
   *  silently degrading to solo. A reachable "no org" (or sign-out) CLEARS it.
   *  Omit (e.g. the extension) → no caching; `getOrgProfile` returns null on any
   *  failure, exactly as before. */
  orgCache?: {
    get(): OrgProfile | null;
    set(profile: OrgProfile | null): void;
  };
}

export interface VaultSync {
  push(threadId: string, payload: VaultPayload): Promise<void>;
  pull(threadId: string, local?: VaultPayload): Promise<VaultPayload | null>;
  list(): ReturnType<SyncTransport["listVaults"]>;
  reportOrgAudit(convs: AuditSource[]): Promise<number>;
  /** The caller's consolidated org authorization (membership/role/status + the
   *  most-restrictive model + MCP + redaction policy across every org). `null` when
   *  the user belongs to no org (or signed out / offline) → surfaces enforce nothing. */
  getOrgProfile(): Promise<OrgProfile | null>;
  /** Register/heartbeat this device (no-op without `getDevice`). */
  registerDevice(): Promise<void>;
  /** The account's connected devices, with `current` flagged for this one. */
  listDevices(): Promise<DeviceInfo[]>;
  /** Forget a device by id. */
  revokeDevice(deviceId: string): Promise<void>;
}

export function createVaultSync(opts: VaultSyncOptions): VaultSync {
  const { transport } = opts;
  const fail = (where: string, err: unknown) => opts.onError?.(where, err);
  const passphrase = async () => (await opts.getPassphrase()) || null;
  const device = async () => (opts.getDevice ? (await opts.getDevice()) || null : null);

  return {
    /** Encrypt and upload a conversation's vault. No-op without a passphrase. */
    async push(threadId, payload) {
      try {
        const pass = await passphrase();
        if (!pass || !Object.keys(payload.redactionVault).length) return;
        const blob = await encryptVault(payload, pass);
        await transport.putVault(threadId, blob, payload.updatedAt);
      } catch (err) {
        fail("push", err);
      }
    },

    /** Fetch + decrypt a thread's remote vault and merge it with the local one.
     *  Returns the merged payload (or the remote as-is if no local), or null when
     *  there is nothing usable (no remote, no passphrase, decrypt failed). */
    async pull(threadId, local) {
      try {
        const pass = await passphrase();
        if (!pass) return null;
        const remote = await transport.getVault(threadId);
        if (!remote) return null;
        const decrypted = await decryptVault(remote.blob, pass);
        return local ? mergeVaultPayloads(local, decrypted) : decrypted;
      } catch (err) {
        fail("pull", err);
        return null;
      }
    },

    async list() {
      try {
        return await transport.listVaults();
      } catch (err) {
        fail("list", err);
        return [];
      }
    },

    /** Report aggregate redaction counts to EVERY org the user belongs to. Counts
     *  only — see events.ts. Returns how many events were sent (0 if no org). */
    async reportOrgAudit(convs) {
      try {
        const orgs: OrgRef[] = await transport.listOrgs();
        if (!orgs.length) return 0;
        const events = deriveRedactionEvents(convs);
        if (!events.length) return 0;
        let allOk = true;
        for (const org of orgs) {
          try {
            await transport.reportRedactionEvents(org.organization_uuid, events);
          } catch (err) {
            allOk = false;
            fail("reportOrgAudit:" + org.organization_uuid, err);
          }
        }
        // Report the sent count ONLY when every org POST landed — the caller marks
        // these originals "reported" (dedup ledger) on a positive count, so on ANY
        // failure we return 0 to leave them in the delta and RETRY on the next touch
        // / next launch (the local conversations are the durable source). This is
        // what stops a backend outage from permanently dropping audit events.
        return allOk ? events.length : 0;
      } catch (err) {
        fail("reportOrgAudit", err);
        return 0;
      }
    },

    /** Read + consolidate the caller's org authorization. On an UNREACHABLE backend
     *  (listOrgs throws) it returns the last-known-good from `orgCache` so the org
     *  tab + enforcement survive an outage; a reachable "no org" returns null AND
     *  clears the cache. Without `orgCache` it falls back to null (prior behavior). */
    async getOrgProfile(): Promise<OrgProfile | null> {
      let orgs: OrgRef[];
      try {
        orgs = await transport.listOrgs();
      } catch (err) {
        // Backend unreachable / 5xx — keep the last-known-good instead of nulling
        // out the org tab + enforcement (the exact offline-clobber bug).
        fail("getOrgProfile:listOrgs", err);
        return opts.orgCache?.get() ?? null;
      }
      if (!orgs.length) {
        // Reachable, but the caller is in no org (or signed out) — clear the cache.
        opts.orgCache?.set(null);
        return null;
      }
      try {
        // Les listes sont des ALLOW-lists consolidées par INTERSECTION : un modèle
        // n'est utilisable que si TOUTES les organisations de la personne l'autorisent.
        // `null` = « on n'a pas encore d'intersection », distinct d'un ensemble vide
        // (« aucune organisation n'autorise rien »), sans quoi la première itération
        // écraserait tout.
        let allowedModels: Set<string> | null = null;
        let allowedMcp: Set<string> | null = null;
        const forced = new Set<string>();
        // ⚠️ Un échec PARTIEL ne doit ni ouvrir les vannes ni s'écrire dans le cache :
        // sous l'ancienne forme, un `/models` en 5xx produisait une liste de blocage
        // VIDE qui remplaçait la dernière bonne politique — le déblocage survivait
        // alors aux redémarrages. On marque, et on rend la main plus bas.
        let degraded = false;
        for (const org of orgs) {
          try {
            const policy = await transport.listModelPolicy(org.organization_uuid);
            const ok = new Set(policy.filter((r) => r.enabled === true).map((r) => r.model_id));
            allowedModels = allowedModels ? intersect(allowedModels, ok) : ok;
          } catch (err) {
            degraded = true;
            fail("getOrgProfile:models:" + org.organization_uuid, err);
          }
          try {
            const mcp = await transport.listMcpPolicy(org.organization_uuid);
            const ok = new Set(mcp.filter((r) => r.allowed === true).map((r) => r.server_id));
            allowedMcp = allowedMcp ? intersect(allowedMcp, ok) : ok;
          } catch (err) {
            degraded = true;
            fail("getOrgProfile:mcp:" + org.organization_uuid, err);
          }
          const rp = readRedactionPolicy(org);
          for (const c of rp.forcedCategories) forced.add(c);
        }
        // Politique incomplète ⇒ la dernière bonne connue fait autorité, et le cache
        // n'est PAS réécrit. Sans cache (l'extension), on rend un profil marqué
        // `degraded` avec des listes vides : en sémantique allow-list c'est le repli
        // FERMÉ, et l'interface a de quoi le dire au lieu de bloquer sans raison.
        if (degraded) {
          const known = opts.orgCache?.get();
          if (known) return { ...known, degraded: true };
        }
        const primary = orgs[0];
        // Best-effort member count for the primary org (design "48 membres").
        let memberCount: number | undefined;
        try {
          memberCount = (await transport.getOrganization(primary.organization_uuid))
            ?.member_count;
        } catch (err) {
          fail("getOrgProfile:detail:" + primary.organization_uuid, err);
        }
        // Primary org's prepaid credit budget — gates platform/keyless sends.
        let credits: CreditBalance | undefined;
        try {
          credits = (await transport.getOrgUsage(primary.organization_uuid)) ?? undefined;
        } catch (err) {
          fail("getOrgProfile:usage:" + primary.organization_uuid, err);
        }
        const profile: OrgProfile = {
          orgs,
          organizationUuid: primary.organization_uuid,
          organizationName: primary.organization_name,
          organizationSlug: primary.organization_slug,
          plan: primary.organization_account_type,
          memberCount,
          role: primary.role,
          status: primary.status,
          allowedModelIds: [...(allowedModels ?? [])],
          allowedMcpIds: [...(allowedMcp ?? [])],
          // Un compte géré par une organisation ne pose pas ses propres clés : c'est
          // l'organisation qui fournit les modèles et paie les appels, et une clé
          // personnelle serait une sortie que sa politique ne voit pas. Le jour où
          // cela se gouverne par organisation, c'est ce champ qui portera le réglage.
          byoKeysAllowed: false,
          forcedCategories: [...forced],
          credits,
          ...(degraded ? { degraded: true } : {}),
        };
        // Un profil dégradé ne devient jamais la référence en cache.
        if (!degraded) opts.orgCache?.set(profile);
        return profile;
      } catch (err) {
        fail("getOrgProfile", err);
        return opts.orgCache?.get() ?? null;
      }
    },

    async registerDevice() {
      try {
        const d = await device();
        if (d) await transport.registerDevice(d);
      } catch (err) {
        fail("registerDevice", err);
      }
    },

    async listDevices(): Promise<DeviceInfo[]> {
      try {
        const [rows, self] = await Promise.all([transport.listDevices(), device()]);
        return rows.map((r) => ({ ...r, current: !!self && r.deviceId === self.deviceId }));
      } catch (err) {
        fail("listDevices", err);
        return [];
      }
    },

    async revokeDevice(deviceId: string) {
      try {
        await transport.revokeDevice(deviceId);
      } catch (err) {
        fail("revokeDevice", err);
      }
    },
  };
}

export { isVaultSubset, mergeVaultPayloads };
