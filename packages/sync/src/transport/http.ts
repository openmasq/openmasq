/**
 * REST transport against `@openmasq/backend` (Supabase-JWT authed). The only
 * platform coupling is `getToken` (returns the current access token, or null when
 * signed out) and an optional `fetch` override — everything else is standard.
 * A null token short-circuits to empty results, so a signed-out client no-ops.
 */
import type {
  ConvKeyEnvelope,
  DeviceIdentity,
  DeviceInfo,
  EncryptedBlob,
  EncryptedRecord,
  McpPolicyRow,
  CreditBalance,
  ModelPolicyRow,
  OrgRef,
  RecordTransport,
  RedactionEvent,
  ServerRecord,
  SyncTransport,
  SyncedVault,
  SyncedVaultMeta,
} from "../types";
import { createDeviceAuth } from "./deviceAuth";

export interface HttpTransportOptions {
  /** Backend origin, e.g. https://api.acme.test (no trailing /api-features). */
  baseUrl: string;
  /** Current Supabase access token, or null when signed out. */
  getToken: () => Promise<string | null> | string | null;
  /** This device's stable sync id. REQUIRED for the record channel (v2) AND for
   *  the vault channel: the backend keys its direction capability
   *  (replica/contributor) on it and 403s a call without the header.
   *  ⚠️ The vault channel used to ignore it — it carried the reversible
   *  real↔fake map with NO capability gate, so a contributor (the extension,
   *  which holds the same passphrase) could pull and decrypt every replica's
   *  thread. Both channels now identify the device on every call. */
  getDeviceId?: () => string | null;
  /** The device's TOFU secret (registered hashed at first registration). When
   *  present, record calls authenticate with a SHORT-LIVED minted device token
   *  (`x-<slug>-device-token`, capability signed inside) instead of the bare id
   *  — the id is enumerable, the secret is not. Mint failure (older backend)
   *  falls back to the id header. */
  /** ⚠️ Peut rendre une PROMESSE : sur le bureau le secret vit dans le magasin
   *  chiffré du processus principal, pas en mémoire du renderer. */
  getDeviceSecret?: () => string | null | Promise<string | null>;
  /** Override the global fetch (e.g. a Capacitor native HTTP shim). */
  fetch?: typeof fetch;
}

export function httpTransport(opts: HttpTransportOptions): SyncTransport & RecordTransport {
  const root = opts.baseUrl.replace(/\/+$/, "") + "/api-features";
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  // Mint cache + cool-down live in `deviceAuth.ts` (shared with the org-scope
  // transport — one home, rule 9); per-transport state, never module-level.
  const deviceAuth = createDeviceAuth({
    getDeviceId: opts.getDeviceId,
    getDeviceSecret: opts.getDeviceSecret,
    mint: (deviceId, secret) =>
      call<{ token: string; expiresIn: number }>(`/sync/devices/${enc(deviceId)}/token`, {
        method: "POST",
        body: JSON.stringify({ secret }),
      }),
  });
  const deviceHeaders = () => deviceAuth.deviceHeaders();

  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
    const token = await opts.getToken();
    if (!token) return null;
    const res = await doFetch(root + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      // The status rides ON the error: a caller that must react to WHICH failure it was
      // (the device-token mint below backs off differently on a refusal than on a hiccup)
      // would otherwise have to parse the message.
      const err = new Error(`[sync] ${init?.method ?? "GET"} ${path} → ${res.status}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }

  const enc = encodeURIComponent;

  return {
    // ---- vault channel (v1). Device-identified like the record channel: the
    // blob IS the reversible real↔fake map, so it is gated on the SAME direction
    // capability (a contributor reaches only its own `ext:` namespace).
    async listVaults(): Promise<SyncedVaultMeta[]> {
      const out = await call<{ vaults: SyncedVaultMeta[] }>("/sync/vaults", {
        headers: await deviceHeaders(),
      });
      return out?.vaults ?? [];
    },

    async getVault(threadId): Promise<SyncedVault | null> {
      const out = await call<{ vault: SyncedVault | null }>(`/sync/vaults/${enc(threadId)}`, {
        headers: await deviceHeaders(),
      });
      return out?.vault ?? null;
    },

    async putVault(threadId, blob: EncryptedBlob, updatedAt): Promise<void> {
      await call(`/sync/vaults/${enc(threadId)}`, {
        method: "PUT",
        body: JSON.stringify({ blob, updatedAt }),
        headers: await deviceHeaders(),
      });
    },

    async listOrgs(): Promise<OrgRef[]> {
      // ⚠️ « Pas de jeton » (déconnecté, ou l'auth pas encore résolue au démarrage)
      // doit lire comme INCONNU — jamais comme « aucune organisation ». Le `call`
      // silencieux d'à côté rendait [], que `getOrgProfile` prenait pour un
      // no-org JOIGNABLE : profil null + cache par compte EFFACÉ — un membre
      // paraissait solo (carte « Créer une organisation », politique envolée)
      // sur une simple course de démarrage. On JETTE, donc l'appelant garde la
      // dernière bonne politique et réessaie.
      if (!(await opts.getToken())) throw new Error("[sync] signed out — org membership unknown");
      const out = await call<{ organizations: OrgRef[] }>("/organizations/me");
      return out?.organizations ?? [];
    },

    async getOrganization(orgUuid: string): Promise<{ member_count?: number } | null> {
      const out = await call<{ organization: { member_count?: number } }>(
        `/organizations/${enc(orgUuid)}`,
      );
      return out?.organization ?? null;
    },

    async listModelPolicy(orgUuid: string): Promise<ModelPolicyRow[]> {
      const out = await call<{ policy: ModelPolicyRow[] }>(`/organizations/${enc(orgUuid)}/models`);
      return out?.policy ?? [];
    },

    async listMcpPolicy(orgUuid: string): Promise<McpPolicyRow[]> {
      const out = await call<{ policy: McpPolicyRow[] }>(`/organizations/${enc(orgUuid)}/mcp`);
      return out?.policy ?? [];
    },

    async getOrgUsage(orgUuid: string): Promise<CreditBalance | null> {
      const out = await call<{
        usage?: {
          credits?: {
            blocked?: boolean;
            allotment_cents?: number;
            consumed_cents?: number;
            balance_cents?: number;
          };
        };
      }>(`/organizations/${enc(orgUuid)}/usage`);
      const c = out?.usage?.credits;
      if (!c) return null;
      return {
        blocked: !!c.blocked,
        allotmentCents: c.allotment_cents ?? 0,
        consumedCents: c.consumed_cents ?? 0,
        balanceCents: c.balance_cents ?? 0,
      };
    },

    async reportRedactionEvents(orgUuid: string, events: RedactionEvent[]): Promise<void> {
      await call(`/organizations/${enc(orgUuid)}/events/redaction`, {
        method: "POST",
        body: JSON.stringify({ events }),
      });
    },

    async registerDevice(device: DeviceIdentity): Promise<void> {
      await call("/sync/devices", { method: "POST", body: JSON.stringify(device) });
    },

    async listDevices(): Promise<Omit<DeviceInfo, "current">[]> {
      const out = await call<{ devices: Omit<DeviceInfo, "current">[] }>("/sync/devices");
      return out?.devices ?? [];
    },

    async revokeDevice(deviceId: string): Promise<void> {
      await call(`/sync/devices/${enc(deviceId)}`, { method: "DELETE" });
    },

    // ---- record channel (v2). Every call carries the device identification —
    // the backend enforces the direction capability on it (fail closed).
    async listChangedConvs(since: number) {
      const out = await call<{ convIds: string[]; cursor: number }>(
        `/sync/records?since=${since}`,
        { headers: await deviceHeaders() },
      );
      return out ?? { convIds: [], cursor: since };
    },

    async getRecords(convId: string, since: number) {
      const out = await call<{ records: ServerRecord[]; seq: number }>(
        `/sync/records/${enc(convId)}?since=${since}`,
        { headers: await deviceHeaders() },
      );
      return out ?? { records: [], seq: since };
    },

    async putRecords(convId: string, records: EncryptedRecord[]): Promise<number> {
      const out = await call<{ seq: number }>(`/sync/records/${enc(convId)}`, {
        method: "PUT",
        body: JSON.stringify({ records }),
        headers: await deviceHeaders(),
      });
      return out?.seq ?? 0;
    },

    async getConvKey(convId: string): Promise<ConvKeyEnvelope | null> {
      const out = await call<{ key: ConvKeyEnvelope | null }>(`/sync/keys/${enc(convId)}`, {
        headers: await deviceHeaders(),
      });
      return out?.key ?? null;
    },

    async putConvKey(convId, envelope, replace): Promise<ConvKeyEnvelope> {
      const out = await call<{ key: ConvKeyEnvelope }>(`/sync/keys/${enc(convId)}`, {
        method: "PUT",
        body: JSON.stringify({ key: envelope, replace: !!replace }),
        headers: await deviceHeaders(),
      });
      return out?.key ?? envelope;
    },

    async listConvKeys(): Promise<string[]> {
      const out = await call<{ convIds: string[] }>("/sync/keys", {
        headers: await deviceHeaders(),
      });
      return out?.convIds ?? [];
    },

    async deleteConv(convId: string): Promise<void> {
      await call(`/sync/records/${enc(convId)}`, {
        method: "DELETE",
        headers: await deviceHeaders(),
      });
    },
  };
}
